import express from 'express';
import cors from 'cors';
import { connectDatabase } from './db.js';
import { initializeEmailTable, listEmailsAwaitingQueue } from './models/email.model.js';
import { emailsRouter } from './routes/emails.js';
import { emailQueue, enqueueEmail } from './queue.js';
import { authRouter } from './auth/routes.js';
import { initializeUsersTable } from './auth/users.js';

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use('/auth', authRouter);
app.use('/emails', emailsRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

async function startServer() {
  try {
    await connectDatabase();
    await initializeUsersTable();
    await initializeEmailTable();
    await emailQueue.waitUntilReady();

    // Rebuild missing Redis jobs from MySQL after an API restart.
    const pendingEmails = await listEmailsAwaitingQueue();
    for (const email of pendingEmails) {
      await enqueueEmail(email.id, email.scheduledAt);
    }

    app.listen(3000, () => console.log('API on :3000'));
  } catch (error) {
    console.error('Could not connect to MySQL:', error);
    process.exitCode = 1;
  }
}

void startServer();
