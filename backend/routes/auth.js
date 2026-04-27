const express = require('express');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { signToken } = require('../middleware/auth');
const { eq } = require('drizzle-orm');
const { players } = require('../db/schema');

const router = express.Router();

// GET /auth/nonce?wallet=<pubkey>
// Generates a random nonce for the player to sign
router.get('/nonce', async (req, res) => {
  const { wallet } = req.query;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing wallet query parameter' });
  }

  const db = req.app.locals.db;
  const nonce = crypto.randomBytes(32).toString('hex');
  const nonceExpires = Date.now() + 5 * 60 * 1000; // 5 min TTL

  // Upsert player with nonce
  await db.insert(players).values({ wallet, nonce, nonceExpires, lastSeen: Date.now() }).onConflictDoUpdate({
    target: players.wallet,
    set: { nonce, nonceExpires, lastSeen: Date.now() },
  });

  res.json({ nonce });
});

// POST /auth/verify
// Verifies the player's ed25519 signature of the nonce
router.post('/verify', async (req, res) => {
  const { wallet, signature, nonce } = req.body;
  if (!wallet || !signature || !nonce) {
    return res.status(400).json({ error: 'Missing wallet, signature, or nonce' });
  }

  const db = req.app.locals.db;

  // Look up stored nonce
  const [player] = await db
    .select({ nonce: players.nonce, nonceExpires: players.nonceExpires })
    .from(players)
    .where(eq(players.wallet, wallet));

  if (!player) {
    return res.status(401).json({ error: 'Unknown wallet. Request a nonce first.' });
  }
  if (player.nonce !== nonce) {
    return res.status(401).json({ error: 'Nonce mismatch' });
  }
  if (Date.now() > player.nonceExpires) {
    return res.status(401).json({ error: 'Nonce expired. Request a new one.' });
  }

  // Verify ed25519 signature
  try {
    const messageBytes = new TextEncoder().encode(nonce);
    const signatureBytes = bs58.default.decode(signature);
    const publicKeyBytes = bs58.default.decode(wallet);

    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // Clear nonce (single-use) and store session token
  const token = signToken(wallet);
  const sessionExpires = Date.now() + 15 * 60 * 1000; // 15 min

  await db.update(players).set({
    nonce: null,
    nonceExpires: null,
    sessionToken: token,
    sessionExpires,
    lastSeen: Date.now(),
  }).where(eq(players.wallet, wallet));

  res.json({ token });
});

// POST /auth/dev-login — dev mode only: skip signature, issue JWT directly
router.post('/dev-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { wallet } = req.body;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing wallet' });
  }

  const db = req.app.locals.db;

  await db.insert(players).values({ wallet, lastSeen: Date.now() }).onConflictDoUpdate({
    target: players.wallet,
    set: { lastSeen: Date.now() },
  });

  const token = signToken(wallet);
  res.json({ token });
});

module.exports = router;
