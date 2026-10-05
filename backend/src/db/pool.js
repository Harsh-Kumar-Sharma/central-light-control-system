import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

// Times are exchanged in UTC on both sides. Without this, mysql2 reads the
// server's TIMESTAMP text as if it were in THIS machine's timezone, so
// whenever the app and the database server sit in different timezones every
// "last seen / x minutes ago" is shifted by the difference (hours, in practice).
export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});
