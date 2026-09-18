import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { env } from '../config/env.js';

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
  if (existing.length > 0) {
    console.log(`Admin user "${username}" already exists — skipping seed.`);
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [adminRole] = await pool.query("SELECT id FROM roles WHERE name = 'Admin'");
  if (adminRole.length === 0) {
    throw new Error('Admin role not found — run migrations first.');
  }

  await pool.query(
    'INSERT INTO users (username, password_hash, role_id, status) VALUES (?, ?, ?, ?)',
    [username, passwordHash, adminRole[0].id, 'active']
  );

  console.log(`Seeded Admin user "${username}". Change the password after first login.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
