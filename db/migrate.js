const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query('SELECT name FROM migrations ORDER BY id');
  return new Set(result.rows.map((r) => r.name));
}

async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migration applied: ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  if (count === 0) {
    console.log('Database is up to date');
  } else {
    console.log(`Applied ${count} migration(s)`);
  }
}

module.exports = { runMigrations };
