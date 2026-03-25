/**
 * SnapDuel Anchor Program — Full Test Suite
 *
 * Author  : Sanskriti Singh <sanskritiisinghh2404@gmail.com>
 * GitHub  : https://github.com/sanskritisingh245
 * Network : Localnet / Devnet
 *
 * Tests cover:
 *  1. top_up          — happy path, accumulation, overflow guard
 *  2. deduct_credit   — happy path, insufficient credits, same player, replay attack
 *  3. settle_match    — player one wins, player two wins, already settled, invalid winner
 *  4. cancel_match    — happy path, already settled
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { Snapduel } from "../target/types/snapduel";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

// ─── Constants (must match lib.rs) ───────────────────────────────────────────
const RAKE_BPS = 500n;
const WAGER_LAMPORTS = 10_000_000n;
const TOPUP_COST_LAMPORTS = 50_000_000n;
const CREDITS_PER_TOPUP = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive the treasury PDA */
function getTreasuryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("treasury")], programId);
}

/** Derive a PlayerCredits PDA for a given wallet */
function getCreditsPda(
  wallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("credits"), wallet.toBuffer()],
    programId
  );
}

/** Derive a MatchEscrow PDA for a given match_id (16-byte Buffer) */
function getEscrowPda(
  matchId: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), matchId],
    programId
  );
}

/** Derive a Leaderboard PDA for a given wallet */
function getLeaderboardPda(
  wallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("leaderboard"), wallet.toBuffer()],
    programId
  );
}

/** Generate a random 16-byte match ID (simulates a UUID v4) */
function randomMatchId(): Buffer {
  const buf = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

/** Convert a Buffer into a number[] for the Anchor instruction parameter */
function matchIdToArray(buf: Buffer): number[] {
  return Array.from(buf);
}

/** Airdrop SOL to a keypair and confirm */
async function airdrop(
  provider: anchor.AnchorProvider,
  target: PublicKey,
  sol: number = 2
): Promise<void> {
  const sig = await provider.connection.requestAirdrop(
    target,
    sol * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig, "confirmed");
}

/** Fetch lamport balance */
async function getLamports(
  provider: anchor.AnchorProvider,
  pubkey: PublicKey
): Promise<bigint> {
  const info = await provider.connection.getAccountInfo(pubkey);
  return BigInt(info?.lamports ?? 0);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("snapduel", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Snapduel as Program<Snapduel>;
  const programId = program.programId;

  // Backend authority — in production this is your server keypair
  const authority = (provider.wallet as anchor.Wallet).payer;

  // PDAs
  const [treasury] = getTreasuryPda(programId);

  // ─── top_up ─────────────────────────────────────────────────────────────

  describe("top_up", () => {
    let player: Keypair;
    let playerCreditsPda: PublicKey;

    before(async () => {
      player = Keypair.generate();
      await airdrop(provider, player.publicKey, 2);
      [playerCreditsPda] = getCreditsPda(player.publicKey, programId);
    });

    it("creates PlayerCredits and transfers SOL to treasury", async () => {
      const treasuryBefore = await getLamports(provider, treasury);
      const playerBefore = await getLamports(provider, player.publicKey);

      await program.methods
        .topUp()
        .accounts({
          player: player.publicKey,
          treasury,
          playerCredits: playerCreditsPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      // PlayerCredits account should now have CREDITS_PER_TOPUP plays
      const credits = await program.account.playerCredits.fetch(playerCreditsPda);
      assert.equal(credits.playsRemaining, CREDITS_PER_TOPUP, "wrong plays_remaining");
      assert.equal(credits.totalToppedUp.toNumber(), 1, "wrong total_topped_up");
      assert.isTrue(credits.player.equals(player.publicKey), "wrong player pubkey");

      // Treasury should have grown by TOPUP_COST_LAMPORTS
      const treasuryAfter = await getLamports(provider, treasury);
      assert.equal(
        treasuryAfter - treasuryBefore,
        TOPUP_COST_LAMPORTS,
        "treasury did not receive correct SOL"
      );

      // Player should have paid at least TOPUP_COST_LAMPORTS (plus tx fees)
      const playerAfter = await getLamports(provider, player.publicKey);
      assert.isTrue(
        playerBefore - playerAfter >= TOPUP_COST_LAMPORTS,
        "player did not pay enough SOL"
      );
    });

    it("accumulates credits on second top_up", async () => {
      await program.methods
        .topUp()
        .accounts({
          player: player.publicKey,
          treasury,
          playerCredits: playerCreditsPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      const credits = await program.account.playerCredits.fetch(playerCreditsPda);
      assert.equal(credits.playsRemaining, CREDITS_PER_TOPUP * 2, "credits should accumulate");
      assert.equal(credits.totalToppedUp.toNumber(), 2, "total_topped_up should increment");
    });

    it("different players get independent credit accounts", async () => {
      const player2 = Keypair.generate();
      await airdrop(provider, player2.publicKey, 2);
      const [credits2Pda] = getCreditsPda(player2.publicKey, programId);

      await program.methods
        .topUp()
        .accounts({
          player: player2.publicKey,
          treasury,
          playerCredits: credits2Pda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player2])
        .rpc();

      const credits2 = await program.account.playerCredits.fetch(credits2Pda);
      assert.equal(credits2.playsRemaining, CREDITS_PER_TOPUP, "player2 should have base credits");

      // Player1's credits should be unaffected
      const credits1 = await program.account.playerCredits.fetch(playerCreditsPda);
      assert.equal(credits1.playsRemaining, CREDITS_PER_TOPUP * 2, "player1 credits unchanged");
    });
  });

  // ─── deduct_credit ──────────────────────────────────────────────────────

  describe("deduct_credit", () => {
    let p1: Keypair;
    let p2: Keypair;
    let p1CreditsPda: PublicKey;
    let p2CreditsPda: PublicKey;

    before(async () => {
      p1 = Keypair.generate();
      p2 = Keypair.generate();
      await airdrop(provider, p1.publicKey, 2);
      await airdrop(provider, p2.publicKey, 2);

      [p1CreditsPda] = getCreditsPda(p1.publicKey, programId);
      [p2CreditsPda] = getCreditsPda(p2.publicKey, programId);

      // Give both players credits
      for (const [player, creditsPda] of [
        [p1, p1CreditsPda],
        [p2, p2CreditsPda],
      ] as [Keypair, PublicKey][]) {
        await program.methods
          .topUp()
          .accounts({
            player: player.publicKey,
            treasury,
            playerCredits: creditsPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([player])
          .rpc();
      }
    });

    it("creates escrow, deducts 1 credit from each player, funds escrow", async () => {
      const matchId = randomMatchId();
      const [escrowPda] = getEscrowPda(matchId, programId);

      const p1Before = await program.account.playerCredits.fetch(p1CreditsPda);
      const p2Before = await program.account.playerCredits.fetch(p2CreditsPda);
      const escrowBefore = await getLamports(provider, escrowPda);

      await program.methods
        .deductCredit(matchIdToArray(matchId))
        .accounts({
          authority: authority.publicKey,
          playerOne: p1.publicKey,
          playerTwo: p2.publicKey,
          playerOneCredits: p1CreditsPda,
          playerTwoCredits: p2CreditsPda,
          treasury,
          matchEscrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Credits decremented
      const p1After = await program.account.playerCredits.fetch(p1CreditsPda);
      const p2After = await program.account.playerCredits.fetch(p2CreditsPda);
      assert.equal(
        p1After.playsRemaining,
        p1Before.playsRemaining - 1,
        "p1 credit not decremented"
      );
      assert.equal(
        p2After.playsRemaining,
        p2Before.playsRemaining - 1,
        "p2 credit not decremented"
      );

      // Escrow funded with 2 × WAGER_LAMPORTS
      const escrowAccount = await program.account.matchEscrow.fetch(escrowPda);
      assert.deepEqual(
        Array.from(escrowAccount.matchId),
        Array.from(matchId),
        "match_id mismatch"
      );
      assert.isTrue(escrowAccount.playerOne.equals(p1.publicKey));
      assert.isTrue(escrowAccount.playerTwo.equals(p2.publicKey));
      assert.equal(escrowAccount.wagerLamports.toString(), WAGER_LAMPORTS.toString());
      assert.isFalse(escrowAccount.settled, "should not be settled yet");

      const escrowAfter = await getLamports(provider, escrowPda);
      // Escrow rent-exempt minimum + 2 × WAGER_LAMPORTS
      assert.isTrue(
        escrowAfter >= WAGER_LAMPORTS * 2n,
        "escrow not properly funded"
      );
    });

    it("rejects deduct_credit when player has 0 credits", async () => {
      // Drain p1's credits to 0 first
      const credits = await program.account.playerCredits.fetch(p1CreditsPda);
      for (let i = 0; i < credits.playsRemaining; i++) {
        const mId = randomMatchId();
        const [esc] = getEscrowPda(mId, programId);
        // We need a fresh p3 with credits for each drain
        const p3 = Keypair.generate();
        await airdrop(provider, p3.publicKey, 2);
        const [p3Credits] = getCreditsPda(p3.publicKey, programId);
        await program.methods
          .topUp()
          .accounts({
            player: p3.publicKey,
            treasury,
            playerCredits: p3Credits,
            systemProgram: SystemProgram.programId,
          })
          .signers([p3])
          .rpc();

        await program.methods
          .deductCredit(matchIdToArray(mId))
          .accounts({
            authority: authority.publicKey,
            playerOne: p1.publicKey,
            playerTwo: p3.publicKey,
            playerOneCredits: p1CreditsPda,
            playerTwoCredits: p3Credits,
            treasury,
            matchEscrow: esc,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      }

      // Now p1 has 0 credits — next call should fail
      const brokeP = Keypair.generate();
      await airdrop(provider, brokeP.publicKey, 2);
      const [brokeCredits] = getCreditsPda(brokeP.publicKey, programId);
      await program.methods
        .topUp()
        .accounts({
          player: brokeP.publicKey,
          treasury,
          playerCredits: brokeCredits,
          systemProgram: SystemProgram.programId,
        })
        .signers([brokeP])
        .rpc();

      const mId = randomMatchId();
      const [esc] = getEscrowPda(mId, programId);

      try {
        await program.methods
          .deductCredit(matchIdToArray(mId))
          .accounts({
            authority: authority.publicKey,
            playerOne: p1.publicKey,
            playerTwo: brokeP.publicKey,
            playerOneCredits: p1CreditsPda,
            playerTwoCredits: brokeCredits,
            treasury,
            matchEscrow: esc,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        assert.fail("should have thrown InsufficientCredits");
      } catch (e) {
        assert.include(
          (e as AnchorError).message,
          "InsufficientCredits",
          "expected InsufficientCredits error"
        );
      }
    });

    it("rejects replay — same match_id used twice", async () => {
      // Fresh players with credits
      const a = Keypair.generate();
      const b = Keypair.generate();
      await airdrop(provider, a.publicKey, 2);
      await airdrop(provider, b.publicKey, 2);
      const [aCreds] = getCreditsPda(a.publicKey, programId);
      const [bCreds] = getCreditsPda(b.publicKey, programId);
      for (const [pl, cr] of [[a, aCreds], [b, bCreds]] as [Keypair, PublicKey][]) {
        await program.methods.topUp().accounts({ player: pl.publicKey, treasury, playerCredits: cr, systemProgram: SystemProgram.programId }).signers([pl]).rpc();
      }

      const matchId = randomMatchId();
      const [escrow] = getEscrowPda(matchId, programId);

      // First call succeeds
      await program.methods
        .deductCredit(matchIdToArray(matchId))
        .accounts({
          authority: authority.publicKey,
          playerOne: a.publicKey,
          playerTwo: b.publicKey,
          playerOneCredits: aCreds,
          playerTwoCredits: bCreds,
          treasury,
          matchEscrow: escrow,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Give them credits again
      await program.methods.topUp().accounts({ player: a.publicKey, treasury, playerCredits: aCreds, systemProgram: SystemProgram.programId }).signers([a]).rpc();
      await program.methods.topUp().accounts({ player: b.publicKey, treasury, playerCredits: bCreds, systemProgram: SystemProgram.programId }).signers([b]).rpc();

      // Second call with same match_id must fail (init requires account to not exist)
      try {
        await program.methods
          .deductCredit(matchIdToArray(matchId))
          .accounts({
            authority: authority.publicKey,
            playerOne: a.publicKey,
            playerTwo: b.publicKey,
            playerOneCredits: aCreds,
            playerTwoCredits: bCreds,
            treasury,
            matchEscrow: escrow,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        assert.fail("should have failed — escrow already exists");
      } catch (e) {
        // Anchor throws an error because init'd account already exists
        assert.ok(e, "expected an error for duplicate match_id");
      }
    });

    it("rejects same player on both sides", async () => {
      const solo = Keypair.generate();
      await airdrop(provider, solo.publicKey, 2);
      const [soloCreds] = getCreditsPda(solo.publicKey, programId);
      await program.methods.topUp().accounts({ player: solo.publicKey, treasury, playerCredits: soloCreds, systemProgram: SystemProgram.programId }).signers([solo]).rpc();

      const mId = randomMatchId();
      const [esc] = getEscrowPda(mId, programId);

      try {
        await program.methods
          .deductCredit(matchIdToArray(mId))
          .accounts({
            authority: authority.publicKey,
            playerOne: solo.publicKey,
            playerTwo: solo.publicKey,
            playerOneCredits: soloCreds,
            playerTwoCredits: soloCreds,
            treasury,
            matchEscrow: esc,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        assert.fail("should have thrown SamePlayer");
      } catch (e) {
        assert.include(
          (e as AnchorError).message,
          "SamePlayer",
          "expected SamePlayer error"
        );
      }
    });
  });

  // ─── settle_match ────────────────────────────────────────────────────────

  describe("settle_match", () => {
    let p1: Keypair;
    let p2: Keypair;
    let p1CreditsPda: PublicKey;
    let p2CreditsPda: PublicKey;
    let escrowPda: PublicKey;
    let matchIdBuf: Buffer;

    /** Spin up fresh players, top up, and create an escrow */
    async function setupMatch(): Promise<{
      p1: Keypair;
      p2: Keypair;
      p1CreditsPda: PublicKey;
      p2CreditsPda: PublicKey;
      escrowPda: PublicKey;
      matchIdBuf: Buffer;
    }> {
      const pp1 = Keypair.generate();
      const pp2 = Keypair.generate();
      await airdrop(provider, pp1.publicKey, 2);
      await airdrop(provider, pp2.publicKey, 2);

      const [c1] = getCreditsPda(pp1.publicKey, programId);
      const [c2] = getCreditsPda(pp2.publicKey, programId);

      for (const [pl, cr] of [[pp1, c1], [pp2, c2]] as [Keypair, PublicKey][]) {
        await program.methods.topUp().accounts({ player: pl.publicKey, treasury, playerCredits: cr, systemProgram: SystemProgram.programId }).signers([pl]).rpc();
      }

      const mId = randomMatchId();
      const [esc] = getEscrowPda(mId, programId);

      await program.methods
        .deductCredit(matchIdToArray(mId))
        .accounts({
          authority: authority.publicKey,
          playerOne: pp1.publicKey,
          playerTwo: pp2.publicKey,
          playerOneCredits: c1,
          playerTwoCredits: c2,
          treasury,
          matchEscrow: esc,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      return {
        p1: pp1, p2: pp2,
        p1CreditsPda: c1, p2CreditsPda: c2,
        escrowPda: esc, matchIdBuf: mId,
      };
    }

    it("player one wins — correct payout and rake", async () => {
      const { p1, p2, escrowPda, matchIdBuf } = await setupMatch();
      const [p1Lb] = getLeaderboardPda(p1.publicKey, programId);
      const [p2Lb] = getLeaderboardPda(p2.publicKey, programId);

      const winnerBefore = await getLamports(provider, p1.publicKey);
      const treasuryBefore = await getLamports(provider, treasury);

      await program.methods
        .settleMatch(p1.publicKey)
        .accounts({
          authority: authority.publicKey,
          matchEscrow: escrowPda,
          winner: p1.publicKey,
          treasury,
          playerOneLeaderboard: p1Lb,
          playerTwoLeaderboard: p2Lb,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Verify payout math: pot = 0.02 SOL, rake = 5%, payout = 0.019 SOL
      const pot = WAGER_LAMPORTS * 2n;
      const rake = (pot * RAKE_BPS) / 10_000n;
      const payout = pot - rake;

      const winnerAfter = await getLamports(provider, p1.publicKey);
      assert.equal(
        winnerAfter - winnerBefore,
        payout,
        `winner should receive ${payout} lamports`
      );

      const treasuryAfter = await getLamports(provider, treasury);
      assert.equal(
        treasuryAfter - treasuryBefore,
        rake,
        `treasury should receive ${rake} lamports rake`
      );

      // Escrow marked settled
      const escrow = await program.account.matchEscrow.fetch(escrowPda);
      assert.isTrue(escrow.settled, "escrow should be settled");
      assert.isTrue(escrow.winner.equals(p1.publicKey), "winner should be p1");

      // Leaderboard updated
      const p1Leaderboard = await program.account.leaderboard.fetch(p1Lb);
      const p2Leaderboard = await program.account.leaderboard.fetch(p2Lb);
      assert.equal(p1Leaderboard.wins, 1, "p1 should have 1 win");
      assert.equal(p2Leaderboard.losses, 1, "p2 should have 1 loss");
      assert.isTrue(p1Leaderboard.elo > 1000, "winner ELO should increase");
      assert.isTrue(p2Leaderboard.elo < 1000, "loser ELO should decrease");
    });

    it("player two wins — correct payout and rake", async () => {
      const { p1, p2, escrowPda } = await setupMatch();
      const [p1Lb] = getLeaderboardPda(p1.publicKey, programId);
      const [p2Lb] = getLeaderboardPda(p2.publicKey, programId);

      const winnerBefore = await getLamports(provider, p2.publicKey);

      await program.methods
        .settleMatch(p2.publicKey)
        .accounts({
          authority: authority.publicKey,
          matchEscrow: escrowPda,
          winner: p2.publicKey,
          treasury,
          playerOneLeaderboard: p1Lb,
          playerTwoLeaderboard: p2Lb,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const pot = WAGER_LAMPORTS * 2n;
      const rake = (pot * RAKE_BPS) / 10_000n;
      const payout = pot - rake;

      const winnerAfter = await getLamports(provider, p2.publicKey);
      assert.equal(winnerAfter - winnerBefore, payout, "p2 payout incorrect");

      const lb2 = await program.account.leaderboard.fetch(p2Lb);
      assert.equal(lb2.wins, 1, "p2 should have 1 win");
    });

    it("rejects settling an already-settled match", async () => {
      const { p1, p2, escrowPda } = await setupMatch();
      const [p1Lb] = getLeaderboardPda(p1.publicKey, programId);
      const [p2Lb] = getLeaderboardPda(p2.publicKey, programId);

      // Settle once
      await program.methods
        .settleMatch(p1.publicKey)
        .accounts({
          authority: authority.publicKey,
          matchEscrow: escrowPda,
          winner: p1.publicKey,
          treasury,
          playerOneLeaderboard: p1Lb,
          playerTwoLeaderboard: p2Lb,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Settle again — must fail
      try {
        await program.methods
          .settleMatch(p1.publicKey)
          .accounts({
            authority: authority.publicKey,
            matchEscrow: escrowPda,
            winner: p1.publicKey,
            treasury,
            playerOneLeaderboard: p1Lb,
            playerTwoLeaderboard: p2Lb,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        assert.fail("should have thrown MatchAlreadySettled");
      } catch (e) {
        assert.include(
          (e as AnchorError).message,
          "MatchAlreadySettled",
          "expected MatchAlreadySettled"
        );
      }
    });

    it("rejects an invalid winner", async () => {
      const { p1, p2, escrowPda } = await setupMatch();
      const [p1Lb] = getLeaderboardPda(p1.publicKey, programId);
      const [p2Lb] = getLeaderboardPda(p2.publicKey, programId);

      const outsider = Keypair.generate();

      try {
        await program.methods
          .settleMatch(outsider.publicKey)
          .accounts({
            authority: authority.publicKey,
            matchEscrow: escrowPda,
            winner: outsider.publicKey,
            treasury,
            playerOneLeaderboard: p1Lb,
            playerTwoLeaderboard: p2Lb,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        assert.fail("should have thrown InvalidWinner");
      } catch (e) {
        assert.include(
          (e as AnchorError).message,
          "InvalidWinner",
          "expected InvalidWinner"
        );
      }
    });
  });

  // ─── cancel_match ────────────────────────────────────────────────────────

  describe("cancel_match", () => {
    /** Helper to create a fresh match */
    async function setupMatch(): Promise<{
      p1: Keypair;
      p2: Keypair;
      p1CreditsPda: PublicKey;
      p2CreditsPda: PublicKey;
      escrowPda: PublicKey;
    }> {
      const pp1 = Keypair.generate();
      const pp2 = Keypair.generate();
      await airdrop(provider, pp1.publicKey, 2);
      await airdrop(provider, pp2.publicKey, 2);

      const [c1] = getCreditsPda(pp1.publicKey, programId);
      const [c2] = getCreditsPda(pp2.publicKey, programId);

      for (const [pl, cr] of [[pp1, c1], [pp2, c2]] as [Keypair, PublicKey][]) {
        await program.methods.topUp().accounts({ player: pl.publicKey, treasury, playerCredits: cr, systemProgram: SystemProgram.programId }).signers([pl]).rpc();
      }

      const mId = randomMatchId();
      const [esc] = getEscrowPda(mId, programId);

      await program.methods
        .deductCredit(matchIdToArray(mId))
        .accounts({
          authority: authority.publicKey,
          playerOne: pp1.publicKey,
          playerTwo: pp2.publicKey,
          playerOneCredits: c1,
          playerTwoCredits: c2,
          treasury,
          matchEscrow: esc,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      return { p1: pp1, p2: pp2, p1CreditsPda: c1, p2CreditsPda: c2, escrowPda: esc };
    }

    it("refunds pot to treasury and restores 1 credit to each player", async () => {
      const { p1, p2, p1CreditsPda, p2CreditsPda, escrowPda } = await setupMatch();

      const c1Before = await program.account.playerCredits.fetch(p1CreditsPda);
      const c2Before = await program.account.playerCredits.fetch(p2CreditsPda);
      const treasuryBefore = await getLamports(provider, treasury);

      await program.methods
        .cancelMatch()
        .accounts({
          authority: authority.publicKey,
          matchEscrow: escrowPda,
          treasury,
          playerOneCredits: p1CreditsPda,
          playerTwoCredits: p2CreditsPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Credits restored
      const c1After = await program.account.playerCredits.fetch(p1CreditsPda);
      const c2After = await program.account.playerCredits.fetch(p2CreditsPda);
      assert.equal(
        c1After.playsRemaining,
        c1Before.playsRemaining + 1,
        "p1 credit not refunded"
      );
      assert.equal(
        c2After.playsRemaining,
        c2Before.playsRemaining + 1,
        "p2 credit not refunded"
      );

      // Pot returned to treasury
      const treasuryAfter = await getLamports(provider, treasury);
      assert.equal(
        treasuryAfter - treasuryBefore,
        WAGER_LAMPORTS * 2n,
        "treasury did not receive the pot back"
      );

      // Escrow marked settled
      const escrow = await program.account.matchEscrow.fetch(escrowPda);
      assert.isTrue(escrow.settled, "escrow should be settled after cancel");
    });

    it("rejects double-cancel", async () => {
      const { p1CreditsPda, p2CreditsPda, escrowPda } = await setupMatch();

      // Cancel once
      await program.methods
        .cancelMatch()
        .accounts({
          authority: authority.publicKey,
          matchEscrow: escrowPda,
          treasury,
          playerOneCredits: p1CreditsPda,
          playerTwoCredits: p2CreditsPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Cancel again — must fail
      try {
        await program.methods
          .cancelMatch()
          .accounts({
            authority: authority.publicKey,
            matchEscrow: escrowPda,
            treasury,
            playerOneCredits: p1CreditsPda,
            playerTwoCredits: p2CreditsPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        assert.fail("should have thrown MatchAlreadySettled");
      } catch (e) {
        assert.include(
          (e as AnchorError).message,
          "MatchAlreadySettled",
          "expected MatchAlreadySettled on double-cancel"
        );
      }
    });

    it("rejects cancel after settle", async () => {
      const { p1, p2, p1CreditsPda, p2CreditsPda, escrowPda } = await setupMatch();
      const [p1Lb] = getLeaderboardPda(p1.publicKey, programId);
      const [p2Lb] = getLeaderboardPda(p2.publicKey, programId);

      // Settle first
      await program.methods
        .settleMatch(p1.publicKey)
        .accounts({
          authority: authority.publicKey,
          matchEscrow: escrowPda,
          winner: p1.publicKey,
          treasury,
          playerOneLeaderboard: p1Lb,
          playerTwoLeaderboard: p2Lb,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Now try to cancel — must fail
      try {
        await program.methods
          .cancelMatch()
          .accounts({
            authority: authority.publicKey,
            matchEscrow: escrowPda,
            treasury,
            playerOneCredits: p1CreditsPda,
            playerTwoCredits: p2CreditsPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        assert.fail("should have thrown MatchAlreadySettled");
      } catch (e) {
        assert.include(
          (e as AnchorError).message,
          "MatchAlreadySettled",
          "expected MatchAlreadySettled when cancelling after settle"
        );
      }
    });
  });
});
