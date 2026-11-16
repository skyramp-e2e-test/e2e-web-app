'use strict';

const { loadConfig } = require('./config');
const { createPool, waitForDatabase, migrate, seedTestUser } = require('./db');
const { createApp } = require('./app');

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`Startup error: ${err.message}`);
    process.exit(1);
  }

  const pool = createPool(config.databaseUrl);
  await waitForDatabase(pool);
  await migrate(pool);
  await seedTestUser(pool);

  const app = createApp({
    pool,
    signingSecret: config.signingSecret,
    isRealSecret: config.isRealSecret,
  });
  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
