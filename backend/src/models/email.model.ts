import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../db.js';

// Shape of the incoming JSON. `unknown` forces the route to validate each field.
export type ScheduleEmailRequest = {
  senderId?: unknown;
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  scheduledAt?: unknown;
};

// Shape of an email after it has been validated and stored in MySQL.
export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export type ScheduledEmail = {
  id: string;
  googleSub: string;
  senderId: string;
  recipient: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  scheduledAt: Date;
  status: EmailStatus;
  createdAt: Date;
  updatedAt: Date;
};

// The route passes this only after validating the untrusted request body.
export type CreateScheduledEmailInput = Omit<ScheduledEmail, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

export async function initializeEmailTable(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS scheduled_emails (
      id CHAR(36) PRIMARY KEY,
      google_sub VARCHAR(255) NOT NULL,
      sender_id VARCHAR(100) NOT NULL,
      recipient VARCHAR(320) NOT NULL,
      subject VARCHAR(998) NOT NULL,
      text_body MEDIUMTEXT NULL,
      html_body MEDIUMTEXT NULL,
      scheduled_at DATETIME(3) NOT NULL,
      status ENUM('scheduled', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'scheduled',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_scheduled_emails_due (status, scheduled_at),
      INDEX idx_scheduled_emails_owner_due (google_sub, status, scheduled_at)
    ) ENGINE=InnoDB
  `);

  // Add ownership to databases created by earlier versions of the app.
  const [columns] = await db.query<Array<RowDataPacket & { COLUMN_NAME: string }>>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scheduled_emails'`,
  );
  if (!columns.some((column) => column.COLUMN_NAME === 'google_sub')) {
    await db.execute("ALTER TABLE scheduled_emails ADD COLUMN google_sub VARCHAR(255) NOT NULL DEFAULT 'legacy'");
  }

  const [indexes] = await db.query<Array<RowDataPacket & { INDEX_NAME: string }>>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scheduled_emails'`,
  );
  if (!indexes.some((index) => index.INDEX_NAME === 'idx_scheduled_emails_owner_due')) {
    await db.execute('ALTER TABLE scheduled_emails ADD INDEX idx_scheduled_emails_owner_due (google_sub, status, scheduled_at)');
  }
}

export async function createScheduledEmail(input: CreateScheduledEmailInput): Promise<ScheduledEmail> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO scheduled_emails
      (id, google_sub, sender_id, recipient, subject, text_body, html_body, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.googleSub, input.senderId, input.recipient, input.subject, input.textBody, input.htmlBody, input.scheduledAt],
  );

  const now = new Date();
  return { ...input, id, status: 'scheduled', createdAt: now, updatedAt: now };
}

type ScheduledEmailRow = RowDataPacket & {
  id: string;
  googleSub: string;
  senderId: string;
  recipient: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  scheduledAt: Date | string;
  status: EmailStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export async function listEmails(googleSub: string, limit = 50): Promise<ScheduledEmail[]> {
  const [rows] = await db.query<ScheduledEmailRow[]>(
    `SELECT id,
       google_sub AS googleSub,
       sender_id AS senderId,
       recipient,
       subject,
       text_body AS textBody,
       html_body AS htmlBody,
       scheduled_at AS scheduledAt,
       status,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM scheduled_emails
     WHERE google_sub = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [googleSub, limit],
  );

  return rows.map((row) => ({
    ...row,
    scheduledAt: new Date(row.scheduledAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export async function listEmailsAwaitingQueue(): Promise<Array<{ id: string; scheduledAt: Date }>> {
  const [rows] = await db.query<Array<RowDataPacket & { id: string; scheduledAt: Date | string }>>(
    `SELECT id, scheduled_at AS scheduledAt
     FROM scheduled_emails
     WHERE status = 'scheduled'`,
  );

  return rows.map((row) => ({ id: row.id, scheduledAt: new Date(row.scheduledAt) }));
}

export async function getEmailById(id: string): Promise<ScheduledEmail | null> {
  const [rows] = await db.query<ScheduledEmailRow[]>(
    `SELECT id,
       google_sub AS googleSub,
       sender_id AS senderId,
       recipient,
       subject,
       text_body AS textBody,
       html_body AS htmlBody,
       scheduled_at AS scheduledAt,
       status,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM scheduled_emails
     WHERE id = ?
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    scheduledAt: new Date(row.scheduledAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function claimEmailForSending(id: string): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE scheduled_emails
     SET status = 'sending'
     WHERE id = ? AND status = 'scheduled'`,
    [id],
  );
  return result.affectedRows === 1;
}

export async function markEmailSent(id: string): Promise<void> {
  await db.execute(`UPDATE scheduled_emails SET status = 'sent' WHERE id = ? AND status = 'sending'`, [id]);
}

export async function markEmailFailed(id: string): Promise<void> {
  await db.execute(`UPDATE scheduled_emails SET status = 'failed' WHERE id = ? AND status = 'sending'`, [id]);
}
