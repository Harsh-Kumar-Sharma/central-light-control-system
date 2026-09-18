import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local dev: db/ sits next to backend/ in the repo. In the Docker image the
// layout differs (no sibling repo checkout), so MIGRATIONS_DIR overrides this.
const migrationsDir = process.env.MIGRATIONS_DIR
  ? path.resolve(process.env.MIGRATIONS_DIR)
  : path.resolve(__dirname, '../../../db');

async function main() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.changeUser({ database: env.db.database });

  // Tracks which migration files have already run, so re-running this
  // script (e.g. after adding a new .sql file) only applies what's new —
  // found necessary the hard way: re-running the original all-files-always
  // version against an already-migrated DB failed on the second run
  // (ALTER TABLE ADD COLUMN isn't idempotent like CREATE TABLE IF NOT EXISTS).
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying migration: ${file}`);
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    appliedCount += 1;
  }

  await connection.end();
  console.log(appliedCount > 0 ? `Migrations complete: ${appliedCount} applied.` : 'No new migrations to apply.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});
