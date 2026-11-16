'use strict';

const crypto = require('crypto');

// SHA-256 of the real APP_SIGNING_SECRET. Only the hash is stored here; the
// secret itself must never be committed, printed or logged.
const EXPECTED_SECRET_SHA256 =
  '942fe94a4a94d22cd25be21b98556cf2cbecf586af0fc0730a67494911c629fa';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

// Read and validate configuration. The signing secret is required and its
// value must never be printed or logged.
function loadConfig(env = process.env) {
  const secret = env.APP_SIGNING_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('Missing required environment variable APP_SIGNING_SECRET');
  }
  // A non-matching secret does not stop the app; it only disables sign-in.
  const isRealSecret = crypto.timingSafeEqual(
    Buffer.from(sha256Hex(secret), 'hex'),
    Buffer.from(EXPECTED_SECRET_SHA256, 'hex')
  );
  return {
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL || 'postgres://app:app@localhost:5432/app',
    signingSecret: secret,
    isRealSecret,
  };
}

module.exports = { loadConfig, EXPECTED_SECRET_SHA256 };
