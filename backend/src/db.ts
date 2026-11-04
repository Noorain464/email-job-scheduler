import 'dotenv/config';
import mysql from 'mysql2/promise';

// A pool reuses connections instead of opening a new TCP connection per query.
export const db = mysql.createPool({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'email_scheduler',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
});

export async function connectDatabase(): Promise<void> {
  const connection = await db.getConnection();
  try {
    await connection.ping();
    console.log('Connected to MySQL');
  } finally {
    connection.release();
  }
}
