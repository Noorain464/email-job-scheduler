import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../db.js';

const scryptAsync = promisify(scrypt);
const PASSWORD_KEY_LENGTH = 64;

export type PasswordUser = { sub: string; name: string; email: string };
type PasswordUserRow = RowDataPacket & { id: string; name: string; email: string; password_salt: string; password_hash: string };

export async function initializeUsersTable(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_users (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(320) NOT NULL UNIQUE,
      password_salt CHAR(32) NOT NULL,
      password_hash CHAR(128) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB
  `);
}

export async function createPasswordUser(name: string, email: string, password: string): Promise<PasswordUser> {
  const id = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  await db.execute<ResultSetHeader>(
    'INSERT INTO app_users (id, name, email, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)',
    [id, name, email, salt, derived.toString('hex')],
  );
  return { sub: `local_${id}`, name, email };
}

export async function verifyPasswordUser(email: string, password: string): Promise<PasswordUser | null> {
  const [rows] = await db.query<PasswordUserRow[]>(
    'SELECT id, name, email, password_salt, password_hash FROM app_users WHERE email = ? LIMIT 1',
    [email],
  );
  const user = rows[0];
  if (!user) return null;
  const expected = Buffer.from(user.password_hash, 'hex');
  const actual = await scryptAsync(password, user.password_salt, PASSWORD_KEY_LENGTH) as Buffer;
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { sub: `local_${user.id}`, name: user.name, email: user.email };
}
