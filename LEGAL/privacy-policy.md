# Privacy Policy

**TapRush** — Version 1.0
Effective: March 25, 2026 · Last updated: March 25, 2026

---

> TapRush does not collect personal information. We store only your public wallet address and the gameplay data necessary to run the game. We never sell, rent, or trade your data. This policy complies with the [Solana Mobile Publisher Policy](https://docs.solanamobile.com/dapp-store/publisher-policy).

---

## 1. Developer & Contact Information

| Field     | Details                                                        |
| --------- | -------------------------------------------------------------- |
| Developer | Sanskriti Singh                                                |
| App       | TapRush (also known as SnapDuel)                               |
| Email     | sanskritiisinghh2404@gmail.com                                 |
| Support   | sanskritiisinghh2404@gmail.com                                 |
| Website   | [github.com/sanskritisingh245](https://github.com/sanskritisingh245) |
| Platform  | Android — Solana dApp Store                                    |

---

## 2. Information We Collect

We collect only the **minimum data necessary** to operate TapRush, as required by the Solana Mobile Publisher Policy.

### 2.1 Data We Collect

| Data                                  | Why We Collect It                                      |
| ------------------------------------- | ------------------------------------------------------ |
| Solana wallet public address          | Wallet-based authentication, matchmaking, on-chain txs |
| Gameplay records (match results, reaction times, win/loss, ELO, streaks, achievements, tier, XP) | Core game mechanics, leaderboards, daily challenges |
| Session token (JWT, 15-min expiry)    | Authenticated API access                               |
| Estimated network round-trip time     | Latency-compensated anti-cheat timing                  |

### 2.2 Handling of Financial / Regulated Data

TapRush facilitates **SOL cryptocurrency wagering**. Under the Solana Mobile Publisher Policy this constitutes Regulated Data. We apply the following safeguards:

- We collect **only the minimum necessary** financial information (public wallet address and transaction amounts).
- All authentication uses **ed25519 cryptographic signature verification** — no passwords or private keys are ever sent to or stored on our servers.
- We **never** access, request, or store your private keys or seed phrases.
- On-chain transactions are protected by Solana's proof-of-stake consensus and our audited Anchor smart contract (PDA-based escrow, authority checks, replay prevention).
- All client–server communication is encrypted via **HTTPS / TLS**.
- We do **not sell, rent, or share** financial data with any third party.

### 2.3 Data We Do NOT Collect

- Names, email addresses, phone numbers, or other personal identifiers
- Device identifiers, advertising IDs, or IMEI numbers
- GPS / geolocation data
- Contacts, photos, camera, microphone, or filesystem access
- Health, biometric, or genetic information
- Private keys, seed phrases, or wallet passwords
- Browsing history or data from other applications

---

## 3. How We Use Your Data

- **Matchmaking** — pairing you with an opponent via random queue or friend invite codes.
- **Fair-play enforcement** — validating reaction times, detecting early taps, cross-checking client timing against server-side bounds with latency compensation.
- **Leaderboards & progression** — displaying win/loss records, ELO ratings, tier rank, achievements, and daily-challenge progress.
- **Credit & escrow management** — tracking play credits, wager escrow, and SOL payouts via our on-chain Anchor program.
- **Service reliability** — diagnosing errors and improving the gameplay experience.

We do **not** use your data for advertising, user profiling, or any purpose unrelated to operating TapRush.

---

## 4. Data Disclosure & Sharing

We do **not sell, rent, trade, or disclose** User Data to third parties for any commercial purpose.

Your data may be visible in the following limited, necessary ways:

- **Solana blockchain** — on-chain transactions (top-ups, escrows, settlements) are publicly and permanently visible via blockchain explorers. This includes your wallet address, credit balances, and match outcomes.
- **In-app leaderboards** — your wallet address and game statistics are visible to other TapRush players.
- **Match opponents** — your wallet address is shown to your opponent during a duel.

### 4.1 Third-Party Services

TapRush interacts with the third-party services listed below. Each service that accesses User Data is obligated to comply with the Solana Mobile Publisher Policy and applicable data-protection law:

| Service                         | Purpose                            | Data Accessed                    |
| ------------------------------- | ---------------------------------- | -------------------------------- |
| Solana RPC nodes                | On-chain program execution         | Wallet address, transaction data |
| Solana Mobile Wallet Adapter    | Wallet connection & tx signing     | Wallet address (on-device only)  |

We do not integrate analytics SDKs, advertising networks, or tracking services of any kind.

---

## 5. Data Security

We use **encryption and industry best practices** to protect Regulated Data, as required by the Solana Mobile Publisher Policy:

- **Authentication** — ed25519 wallet-signature verification; no passwords stored.
- **Sessions** — short-lived JWTs (15-minute expiry) that auto-invalidate.
- **Transport** — all HTTP traffic encrypted with TLS.
- **Storage** — gameplay database secured with access controls.
- **On-chain** — Anchor smart contract with PDA-based authority checks, escrow replay prevention, and atomic transaction guarantees.

---

## 6. User Consent

By connecting your Solana wallet to TapRush you consent to the practices described in this policy. We do **not** employ fraudulent, deceptive, or coercive measures to obtain consent. Consent is provided through the voluntary, explicit actions of connecting your wallet and signing the authentication message.

You may withdraw consent at any time by disconnecting your wallet and uninstalling TapRush.

---

## 7. Protection of Minors

> **TapRush involves SOL cryptocurrency wagering and is intended exclusively for users aged 18 or older (or the age of majority in your jurisdiction).**

We do **not** knowingly collect User Data from minors as determined by applicable law, without the verifiable consent of a parent or guardian. If we discover that a minor has used TapRush without such consent, we will promptly delete all associated off-chain data.

If you are a parent or guardian and believe your child has used TapRush, contact sanskritiisinghh2404@gmail.com and we will remove the data.

---

## 8. Account Deletion & Data Removal

Per the Solana Mobile Publisher Policy, you may request deletion of your account and all associated User Data at any time.

| Data Category                                                      | Deletion                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Off-chain data (gameplay records, session data, leaderboard stats) | Permanently deleted within **30 days** of request                     |
| On-chain data (credit balances, settled escrows)                   | **Cannot be deleted** — the Solana blockchain is immutable by design  |

To request deletion, email sanskritiisinghh2404@gmail.com with subject **"Account Deletion Request"** and include your wallet public address. We will process your request within 30 days. Data required by law may be retained as necessary to comply with legal obligations.

---

## 9. Data Retention

| Data                            | Retention                                          |
| ------------------------------- | -------------------------------------------------- |
| Session tokens                  | 15 minutes (auto-expire)                           |
| Match records & gameplay stats  | Duration of account activity + 90 days after deletion request |
| On-chain blockchain data        | Permanent (immutable ledger)                       |

---

## 10. Your Rights

Under applicable law you may:

- **Access** — request a copy of the data associated with your wallet address.
- **Delete** — request removal of off-chain data (see Section 8).
- **Rectify** — request correction of inaccurate data.
- **Withdraw consent** — disconnect your wallet and stop using TapRush at any time.
- **Portability** — on-chain data is already publicly accessible via any Solana blockchain explorer.

Contact sanskritiisinghh2404@gmail.com to exercise any right. We will respond within 30 days.

---

## 11. Changes to This Policy

We may update this policy to reflect changes in our practices or applicable law. When material changes are made, the "Last updated" date at the top will be revised and the updated policy will be available at this same URL. Continued use of TapRush after a change constitutes acceptance.

---

## 12. Applicable Law & Compliance

This policy is governed by the applicable data-protection laws of the jurisdictions in which TapRush operates. It is designed to comply with the [Solana Mobile Publisher Policy](https://docs.solanamobile.com/dapp-store/publisher-policy) and the [Solana Mobile dApp Store Developer Agreement](https://docs.solanamobile.com/dapp-store/agreement). Where local law grants additional rights beyond those stated here, those rights apply.

---

## 13. Contact

| Field         | Details                                                        |
| ------------- | -------------------------------------------------------------- |
| Developer     | Sanskriti Singh                                                |
| Email         | sanskritiisinghh2404@gmail.com                                 |
| Website       | [github.com/sanskritisingh245](https://github.com/sanskritisingh245) |
| Response time | Within 30 days                                                 |

---

© 2026 Sanskriti Singh. All rights reserved.
TapRush is distributed via the [Solana dApp Store](https://dappstore.app). This policy complies with the [Solana Mobile Publisher Policy](https://docs.solanamobile.com/dapp-store/publisher-policy).
