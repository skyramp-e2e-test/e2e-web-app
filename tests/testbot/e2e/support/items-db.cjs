// Direct access to the app's items table. The app has no endpoint that deletes
// items, so tests that need an empty list, and their cleanup, go through the
// database the app uses (same default URL as src/config.js).
const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "postgres://app:app@localhost:5432/app";

async function withClient(fn) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Remove every stored item, so the Items page starts from an empty list. */
async function deleteAllItems() {
  await withClient((c) => c.query("DELETE FROM items"));
}

/** Remove the items with these ids (what a test created). */
async function deleteItemsById(ids) {
  if (!ids.length) return;
  await withClient((c) => c.query("DELETE FROM items WHERE id = ANY($1::int[])", [ids]));
}

/** Remove every item these tests may have left behind: names they make start with this prefix. */
const TEST_ITEM_PREFIX = "e2e-items-";
async function deleteTestItems() {
  await withClient((c) => c.query("DELETE FROM items WHERE name LIKE $1 OR name = 'First item'", [`${TEST_ITEM_PREFIX}%`]));
}

module.exports = { deleteAllItems, deleteItemsById, deleteTestItems, TEST_ITEM_PREFIX };

if (require.main === module && process.argv[2] === "cleanup") {
  deleteTestItems().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
