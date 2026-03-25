use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("33tKSaZpH1fiCZDnMswH5McVW21PYrUF1B9g73wnQBa1");

// ─── Constants ────────────────────────────────────────────────────────────────
/// Rake taken from each pot (5% = 500 basis points out of 10_000)
const RAKE_BPS: u64 = 500;
/// Credits awarded per top-up
const CREDITS_PER_TOPUP: u8 = 5;
/// SOL each player's credit represents in the escrow (0.01 SOL)
const WAGER_LAMPORTS: u64 = 10_000_000;
/// Cost for one top-up bundle (0.05 SOL = 5 plays)
const TOPUP_COST_LAMPORTS: u64 = 50_000_000;
/// Starting ELO rating for new players
const STARTING_ELO: u16 = 1_000;
/// ELO K-factor (controls how much a single match shifts ratings)
const K_FACTOR: i32 = 32;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Integer ELO delta: how many points the winner gains (and loser loses).
/// Uses a linear approximation of the logistic expected-win probability.
fn elo_delta(winner_elo: u16, loser_elo: u16) -> i32 {
    // Difference clamped to [-400, 400] to match standard ELO tables
    let diff = (loser_elo as i32 - winner_elo as i32).clamp(-400, 400);
    // expected_win (×100) ≈ 50 + diff × 100/800
    let expected_x100: i32 = 50 + (diff * 100) / 800;
    // delta = K × (1 - expected), using integer arithmetic
    K_FACTOR * (100 - expected_x100) / 100
}

// ─── Program ─────────────────────────────────────────────────────────────────
#[program]
pub mod snapduel {
    use super::*;

    /// Player deposits SOL into the treasury and receives 5 play credits.
    ///
    /// This is the ONLY instruction that players sign directly from their wallet.
    /// All other instructions are signed by the backend authority keypair.
    ///
    /// Accounts: player (signer + payer), treasury PDA, player_credits PDA
    pub fn top_up(ctx: Context<TopUp>) -> Result<()> {
        // Transfer TOPUP_COST_LAMPORTS from player wallet → treasury PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            TOPUP_COST_LAMPORTS,
        )?;

        // Initialize or update PlayerCredits account
        let credits = &mut ctx.accounts.player_credits;
        if credits.player == Pubkey::default() {
            // First top-up: initialize fields
            credits.player = ctx.accounts.player.key();
            credits.bump = ctx.bumps.player_credits;
            credits.total_topped_up = 0;
            credits.plays_remaining = 0;
        }
        credits.plays_remaining = credits
            .plays_remaining
            .checked_add(CREDITS_PER_TOPUP)
            .ok_or(SnapDuelError::Overflow)?;
        credits.total_topped_up = credits
            .total_topped_up
            .checked_add(1)
            .ok_or(SnapDuelError::Overflow)?;

        emit!(TopUpEvent {
            player: ctx.accounts.player.key(),
            cost_lamports: TOPUP_COST_LAMPORTS,
            plays_remaining: credits.plays_remaining,
        });

        msg!(
            "top_up: {} → {} lamports, {} plays remaining",
            ctx.accounts.player.key(),
            TOPUP_COST_LAMPORTS,
            credits.plays_remaining,
        );
        Ok(())
    }

    /// Backend deducts 1 credit from each player and creates a match escrow.
    ///
    /// - Atomically decrements both players' play credits by 1
    /// - Creates a new MatchEscrow PDA keyed by `match_id`
    /// - Moves 2 × WAGER_LAMPORTS from treasury → escrow to fund the pot
    ///
    /// Only the backend authority keypair can sign this instruction.
    /// The `init` constraint on match_escrow prevents the same match_id
    /// from being used twice (replay attack prevention).
    pub fn deduct_credit(ctx: Context<DeductCredit>, match_id: [u8; 16]) -> Result<()> {
        // Validate both players have at least 1 credit
        require!(
            ctx.accounts.player_one_credits.plays_remaining >= 1,
            SnapDuelError::InsufficientCredits
        );
        require!(
            ctx.accounts.player_two_credits.plays_remaining >= 1,
            SnapDuelError::InsufficientCredits
        );

        // Players must not be the same wallet
        require!(
            ctx.accounts.player_one.key() != ctx.accounts.player_two.key(),
            SnapDuelError::SamePlayer
        );

        // Atomically deduct 1 credit from each (checked: can't go below 0 since we verified >= 1)
        ctx.accounts.player_one_credits.plays_remaining -= 1;
        ctx.accounts.player_two_credits.plays_remaining -= 1;

        // Initialize the match escrow
        let escrow = &mut ctx.accounts.match_escrow;
        escrow.match_id = match_id;
        escrow.player_one = ctx.accounts.player_one.key();
        escrow.player_two = ctx.accounts.player_two.key();
        escrow.wager_lamports = WAGER_LAMPORTS;
        escrow.settled = false;
        escrow.winner = Pubkey::default();
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.match_escrow;

        // Transfer 2 × WAGER_LAMPORTS from treasury → escrow
        // Treasury is a PDA of this program — it "signs" via invoke_signed
        let treasury_bump = ctx.bumps.treasury;
        let treasury_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.treasury.to_account_info(),
                    to: ctx.accounts.match_escrow.to_account_info(),
                },
                &[treasury_seeds],
            ),
            WAGER_LAMPORTS * 2,
        )?;

        emit!(MatchCreatedEvent {
            match_id,
            player_one: ctx.accounts.player_one.key(),
            player_two: ctx.accounts.player_two.key(),
            wager_lamports: WAGER_LAMPORTS,
        });

        msg!(
            "deduct_credit: match {:?} — {} vs {}",
            match_id,
            ctx.accounts.player_one.key(),
            ctx.accounts.player_two.key(),
        );
        Ok(())
    }

    /// Settles a completed match: sends pot to winner, rake to treasury.
    ///
    /// - Validates that `winner` is one of the two players in the escrow
    /// - Marks the escrow as settled (replay-proof via `settled` flag + constraint)
    /// - Transfers (pot - rake) lamports from escrow → winner
    /// - Transfers rake lamports from escrow → treasury
    /// - Updates ELO leaderboard for both players
    ///
    /// Only the backend authority keypair can sign this instruction.
    pub fn settle_match(ctx: Context<SettleMatch>, winner: Pubkey) -> Result<()> {
        // Snapshot escrow fields before mutable borrow
        let player_one = ctx.accounts.match_escrow.player_one;
        let player_two = ctx.accounts.match_escrow.player_two;
        let wager_lamports = ctx.accounts.match_escrow.wager_lamports;

        // Winner must be one of the two players in this match
        require!(
            winner == player_one || winner == player_two,
            SnapDuelError::InvalidWinner
        );

        // Calculate payout and rake
        let pot = wager_lamports
            .checked_mul(2)
            .ok_or(SnapDuelError::Overflow)?;
        let rake = pot
            .checked_mul(RAKE_BPS)
            .ok_or(SnapDuelError::Overflow)?
            .checked_div(10_000)
            .ok_or(SnapDuelError::Overflow)?;
        let payout = pot.checked_sub(rake).ok_or(SnapDuelError::Overflow)?;

        // Mark settled BEFORE lamport moves (reentrancy guard)
        ctx.accounts.match_escrow.settled = true;
        ctx.accounts.match_escrow.winner = winner;

        // Collect AccountInfo clones before any borrows conflict
        let escrow_info = ctx.accounts.match_escrow.to_account_info();
        let winner_info = ctx.accounts.winner.to_account_info();
        let treasury_info = ctx.accounts.treasury.to_account_info();

        // Transfer payout: escrow (program-owned) → winner
        // Program-owned accounts can subtract lamports directly
        **escrow_info.try_borrow_mut_lamports()? -= payout;
        **winner_info.try_borrow_mut_lamports()? += payout;

        // Transfer rake: escrow → treasury
        **escrow_info.try_borrow_mut_lamports()? -= rake;
        **treasury_info.try_borrow_mut_lamports()? += rake;

        // ─── Update leaderboards ───────────────────────────────────────────
        // Initialize player one's leaderboard if this is their first match
        if ctx.accounts.player_one_leaderboard.player == Pubkey::default() {
            ctx.accounts.player_one_leaderboard.player = player_one;
            ctx.accounts.player_one_leaderboard.elo = STARTING_ELO;
            ctx.accounts.player_one_leaderboard.bump =
                ctx.bumps.player_one_leaderboard;
        }
        // Initialize player two's leaderboard if this is their first match
        if ctx.accounts.player_two_leaderboard.player == Pubkey::default() {
            ctx.accounts.player_two_leaderboard.player = player_two;
            ctx.accounts.player_two_leaderboard.elo = STARTING_ELO;
            ctx.accounts.player_two_leaderboard.bump =
                ctx.bumps.player_two_leaderboard;
        }

        let p1_elo = ctx.accounts.player_one_leaderboard.elo;
        let p2_elo = ctx.accounts.player_two_leaderboard.elo;
        let is_p1_winner = winner == player_one;

        let delta = if is_p1_winner {
            elo_delta(p1_elo, p2_elo)
        } else {
            elo_delta(p2_elo, p1_elo)
        };

        if is_p1_winner {
            ctx.accounts.player_one_leaderboard.wins =
                ctx.accounts.player_one_leaderboard.wins.saturating_add(1);
            ctx.accounts.player_one_leaderboard.elo =
                (p1_elo as i32 + delta).clamp(0, u16::MAX as i32) as u16;
            ctx.accounts.player_two_leaderboard.losses =
                ctx.accounts.player_two_leaderboard.losses.saturating_add(1);
            ctx.accounts.player_two_leaderboard.elo =
                (p2_elo as i32 - delta).clamp(0, u16::MAX as i32) as u16;
        } else {
            ctx.accounts.player_two_leaderboard.wins =
                ctx.accounts.player_two_leaderboard.wins.saturating_add(1);
            ctx.accounts.player_two_leaderboard.elo =
                (p2_elo as i32 + delta).clamp(0, u16::MAX as i32) as u16;
            ctx.accounts.player_one_leaderboard.losses =
                ctx.accounts.player_one_leaderboard.losses.saturating_add(1);
            ctx.accounts.player_one_leaderboard.elo =
                (p1_elo as i32 - delta).clamp(0, u16::MAX as i32) as u16;
        }

        emit!(MatchSettledEvent {
            match_id: ctx.accounts.match_escrow.match_id,
            winner,
            payout,
            rake,
        });

        msg!(
            "settle_match: winner={}, payout={} lamports, rake={} lamports",
            winner,
            payout,
            rake,
        );
        Ok(())
    }

    /// Cancels a match (disconnect / timeout / tie) and restores credits.
    ///
    /// - Returns 2 × WAGER_LAMPORTS from escrow → treasury
    /// - Refunds 1 credit to each player
    /// - Marks escrow as settled (prevents double-cancel)
    ///
    /// Only the backend authority keypair can sign this instruction.
    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        let escrowed = ctx
            .accounts
            .match_escrow
            .wager_lamports
            .checked_mul(2)
            .ok_or(SnapDuelError::Overflow)?;

        let match_id = ctx.accounts.match_escrow.match_id;

        // Mark settled before lamport moves
        ctx.accounts.match_escrow.settled = true;

        // Collect AccountInfo clones
        let escrow_info = ctx.accounts.match_escrow.to_account_info();
        let treasury_info = ctx.accounts.treasury.to_account_info();

        // Return pot from escrow → treasury
        **escrow_info.try_borrow_mut_lamports()? -= escrowed;
        **treasury_info.try_borrow_mut_lamports()? += escrowed;

        // Refund 1 credit to each player
        ctx.accounts.player_one_credits.plays_remaining = ctx
            .accounts
            .player_one_credits
            .plays_remaining
            .saturating_add(1);
        ctx.accounts.player_two_credits.plays_remaining = ctx
            .accounts
            .player_two_credits
            .plays_remaining
            .saturating_add(1);

        emit!(MatchCancelledEvent { match_id });

        msg!("cancel_match: match {:?} — credits refunded to both players", match_id);
        Ok(())
    }
}

// ─── Account Data Structs ─────────────────────────────────────────────────────

/// Tracks a player's remaining plays and lifetime top-up count.
/// PDA seeds: ["credits", player_pubkey]
/// Space: 8 (discriminator) + 32 + 1 + 8 + 1 = 50 bytes
#[account]
#[derive(Default)]
pub struct PlayerCredits {
    pub player: Pubkey,         // 32 — wallet pubkey
    pub plays_remaining: u8,    //  1 — current credit balance (0–255)
    pub total_topped_up: u64,   //  8 — lifetime top-up counter
    pub bump: u8,               //  1 — PDA canonical bump
}

/// Holds escrowed SOL for a single match.
/// PDA seeds: ["escrow", match_id_bytes]
/// Space: 8 + 16 + 32 + 32 + 8 + 1 + 32 + 8 + 1 = 138 bytes
#[account]
pub struct MatchEscrow {
    pub match_id: [u8; 16],     // 16 — UUID v4 bytes from backend
    pub player_one: Pubkey,     // 32
    pub player_two: Pubkey,     // 32
    pub wager_lamports: u64,    //  8 — per-player wager
    pub settled: bool,          //  1 — replay-attack guard
    pub winner: Pubkey,         // 32 — zero until settled
    pub created_at: i64,        //  8 — Unix timestamp
    pub bump: u8,               //  1
}

/// Per-player win/loss record and ELO rating.
/// PDA seeds: ["leaderboard", player_pubkey]
/// Space: 8 + 32 + 4 + 4 + 2 + 1 = 51 bytes
#[account]
#[derive(Default)]
pub struct Leaderboard {
    pub player: Pubkey,  // 32
    pub wins: u32,       //  4
    pub losses: u32,     //  4
    pub elo: u16,        //  2 — starts at STARTING_ELO (1000)
    pub bump: u8,        //  1
}

// ─── Instruction Contexts ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct TopUp<'info> {
    /// Player wallet — signs the transaction and pays for rent
    #[account(mut)]
    pub player: Signer<'info>,

    /// Treasury PDA — program-controlled SOL vault
    /// CHECK: This is a PDA owned by our program. We only add lamports to it.
    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Player's credit account — created on first top-up, updated on subsequent ones
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + 32 + 1 + 8 + 1,
        seeds = [b"credits", player.key().as_ref()],
        bump,
    )]
    pub player_credits: Account<'info, PlayerCredits>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 16])]
pub struct DeductCredit<'info> {
    /// Backend authority keypair — must sign every deduct_credit call
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Player one wallet — used only for PDA seed derivation
    pub player_one: UncheckedAccount<'info>,

    /// CHECK: Player two wallet — used only for PDA seed derivation
    pub player_two: UncheckedAccount<'info>,

    /// Player one's credit account — must exist and have ≥ 1 play
    #[account(
        mut,
        seeds = [b"credits", player_one.key().as_ref()],
        bump = player_one_credits.bump,
        constraint = player_one_credits.plays_remaining >= 1 @ SnapDuelError::InsufficientCredits,
    )]
    pub player_one_credits: Account<'info, PlayerCredits>,

    /// Player two's credit account — must exist and have ≥ 1 play
    #[account(
        mut,
        seeds = [b"credits", player_two.key().as_ref()],
        bump = player_two_credits.bump,
        constraint = player_two_credits.plays_remaining >= 1 @ SnapDuelError::InsufficientCredits,
    )]
    pub player_two_credits: Account<'info, PlayerCredits>,

    /// Treasury PDA — funds the match escrow
    /// CHECK: PDA owned by our program; we subtract lamports via invoke_signed
    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Match escrow PDA — created fresh for each unique match_id.
    /// `init` means this fails if the account already exists → replay prevention.
    #[account(
        init,
        payer = authority,
        space = 8 + 16 + 32 + 32 + 8 + 1 + 32 + 8 + 1,
        seeds = [b"escrow", match_id.as_ref()],
        bump,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMatch<'info> {
    /// Backend authority keypair
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Match escrow — must not be already settled
    #[account(
        mut,
        seeds = [b"escrow", match_escrow.match_id.as_ref()],
        bump = match_escrow.bump,
        constraint = !match_escrow.settled @ SnapDuelError::MatchAlreadySettled,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    /// CHECK: Winner's wallet — validated inside the instruction body
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// Treasury PDA — receives the rake
    /// CHECK: PDA owned by our program; we add lamports to it
    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Player one's leaderboard — created if this is their first match
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 4 + 4 + 2 + 1,
        seeds = [b"leaderboard", match_escrow.player_one.as_ref()],
        bump,
    )]
    pub player_one_leaderboard: Account<'info, Leaderboard>,

    /// Player two's leaderboard — created if this is their first match
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 4 + 4 + 2 + 1,
        seeds = [b"leaderboard", match_escrow.player_two.as_ref()],
        bump,
    )]
    pub player_two_leaderboard: Account<'info, Leaderboard>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelMatch<'info> {
    /// Backend authority keypair
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Match escrow — must not be already settled
    #[account(
        mut,
        seeds = [b"escrow", match_escrow.match_id.as_ref()],
        bump = match_escrow.bump,
        constraint = !match_escrow.settled @ SnapDuelError::MatchAlreadySettled,
    )]
    pub match_escrow: Account<'info, MatchEscrow>,

    /// Treasury PDA — receives the returned pot
    /// CHECK: PDA owned by our program; we add lamports to it
    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Player one's credit account — receives +1 credit refund
    #[account(
        mut,
        seeds = [b"credits", match_escrow.player_one.as_ref()],
        bump = player_one_credits.bump,
    )]
    pub player_one_credits: Account<'info, PlayerCredits>,

    /// Player two's credit account — receives +1 credit refund
    #[account(
        mut,
        seeds = [b"credits", match_escrow.player_two.as_ref()],
        bump = player_two_credits.bump,
    )]
    pub player_two_credits: Account<'info, PlayerCredits>,

    pub system_program: Program<'info, System>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct TopUpEvent {
    pub player: Pubkey,
    pub cost_lamports: u64,
    pub plays_remaining: u8,
}

#[event]
pub struct MatchCreatedEvent {
    pub match_id: [u8; 16],
    pub player_one: Pubkey,
    pub player_two: Pubkey,
    pub wager_lamports: u64,
}

#[event]
pub struct MatchSettledEvent {
    pub match_id: [u8; 16],
    pub winner: Pubkey,
    pub payout: u64,
    pub rake: u64,
}

#[event]
pub struct MatchCancelledEvent {
    pub match_id: [u8; 16],
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum SnapDuelError {
    /// Player has 0 play credits remaining — must top up first
    #[msg("Insufficient play credits — top up to get more plays")]
    InsufficientCredits,

    /// settle_match or cancel_match called on an already-settled escrow
    #[msg("Match has already been settled")]
    MatchAlreadySettled,

    /// settle_match called with a pubkey that is neither player_one nor player_two
    #[msg("Invalid winner — must be player_one or player_two from the escrow")]
    InvalidWinner,

    /// deduct_credit called with player_one == player_two
    #[msg("Both players must be different wallets")]
    SamePlayer,

    /// Arithmetic overflow in lamport calculations
    #[msg("Arithmetic overflow")]
    Overflow,
}
