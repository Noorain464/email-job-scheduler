import 'dotenv/config';
import { DelayedError, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import {
  claimEmailForSending,
  getEmailById,
  markEmailFailed,
  markEmailSent,
} from './models/email.model.js';
import { createRedisConnection } from './redis.js';
import { closeRateLimiter, reserveSendSlot } from './rate-limit.js';

type SenderConfig = {
  id: string;
  from: string;
  user: string;
  pass: string;
};

type EmailJob = { emailId: string };

function loadSenders(): SenderConfig[] {
  const senders = JSON.parse(process.env.ETHEREAL_SENDERS ?? '[]') as SenderConfig[];
  if (!senders.length) throw new Error('Set ETHEREAL_SENDERS to at least one Ethereal SMTP sender');
  return senders;
}

const senders = loadSenders();
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
if (!Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error('WORKER_CONCURRENCY must be a positive integer');
}
const minSendIntervalMs = Number(process.env.MIN_SEND_INTERVAL_MS ?? 2000);
if (!Number.isInteger(minSendIntervalMs) || minSendIntervalMs < 1) {
  throw new Error('MIN_SEND_INTERVAL_MS must be a positive integer');
}
const maxEmailsPerHourPerSender = Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER ?? 200);
if (!Number.isInteger(maxEmailsPerHourPerSender) || maxEmailsPerHourPerSender < 1) {
  throw new Error('MAX_EMAILS_PER_HOUR_PER_SENDER must be a positive integer');
}

const worker = new Worker<EmailJob>(
  'scheduled-emails',
  async (job) => {
    const email = await getEmailById(job.data.emailId);
    if (!email) throw new Error(`Email ${job.data.emailId} was not found in MySQL`);
    if (email.status !== 'scheduled') {
      console.log(`Skipping email ${email.id}; current status is ${email.status}`);
      return;
    }

    const slot = await reserveSendSlot(
      email.senderId,
      email.id,
      minSendIntervalMs,
      maxEmailsPerHourPerSender,
    );
    if (slot.hourlyLimitHit) {
      console.log(`Sender ${email.senderId} reached its hourly limit; email ${email.id} reserved for ${new Date(slot.sendAt).toISOString()}`);
    }
    if (slot.sendAt > Date.now()) {
      if (!job.token) throw new Error(`Cannot delay email job ${job.id} without its lock token`);
      await job.moveToDelayed(slot.sendAt, job.token);
      throw new DelayedError();
    }

    // Atomic DB claim: a replayed job cannot start a second SMTP send.
    if (!(await claimEmailForSending(email.id))) {
      console.log(`Skipping email ${email.id}; current status is ${email.status}`);
      return;
    }

    try {
      const sender = senders.find((candidate) => candidate.id === email.senderId);
      if (!sender) throw new Error(`No SMTP sender configured with id "${email.senderId}"`);

      const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: sender.user, pass: sender.pass },
      });
      const result = await transporter.sendMail({
        from: sender.from,
        to: email.recipient,
        subject: email.subject,
        text: email.textBody ?? undefined,
        html: email.htmlBody ?? undefined,
      });

      await markEmailSent(email.id);
      console.log(`Sent email ${email.id}; Ethereal preview: ${nodemailer.getTestMessageUrl(result)}`);
    } catch (error) {
      await markEmailFailed(email.id);
      throw error;
    }
  },
  { connection: createRedisConnection(), concurrency },
);

worker.on('ready', () => console.log('Email worker is ready'));
worker.on('failed', (job, error) => console.error(`Email job ${job?.id} failed:`, error));

async function shutdown() {
  await worker.close();
  await closeRateLimiter();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
