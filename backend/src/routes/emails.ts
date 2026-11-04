import express from 'express';
import { createScheduledEmail, listEmails } from '../models/email.model.js';
import type { CreateScheduledEmailInput, ScheduleEmailRequest } from '../models/email.model.js';
import { enqueueEmail } from '../queue.js';
import { requireAuth } from '../auth/session.js';


const emailsRouter = express.Router();
emailsRouter.use(requireAuth);

emailsRouter.get('/senders', (_req, res) => {
  try {
    const senders = JSON.parse(process.env.ETHEREAL_SENDERS ?? '[]') as Array<{ id: string; from: string }>;
    return res.json({ senders: senders.map(({ id, from }) => ({ id, from })) });
  } catch (error) {
    console.error('Failed to read configured email senders:', error);
    return res.status(500).json({ error: 'Could not load email senders' });
  }
});

emailsRouter.get('/', async (req, res) => {
  try {
    const emails = await listEmails(req.user!.sub);
    return res.json({ emails });
  } catch (error) {
    console.error('Failed to list scheduled emails:', error);
    return res.status(500).json({ error: 'Could not load emails' });
  }
});

emailsRouter.post('/', async (req, res) => {
  const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {}) as ScheduleEmailRequest;
  const errors: string[] = [];
  const senderId = typeof body.senderId === 'string' ? body.senderId.trim() : '';
  const recipient = typeof body.to === 'string' ? body.to.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const textBody = typeof body.text === 'string' && body.text.trim() ? body.text : null;
  const htmlBody = typeof body.html === 'string' && body.html.trim() ? body.html : null;
  const scheduledAt = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : new Date(Number.NaN);

  if (!senderId) errors.push('senderId is required');

  if (!/^\S+@\S+\.\S+$/.test(recipient)) errors.push('to must be a valid email address');

  if (!subject) errors.push('subject is required');

  if (!textBody && !htmlBody) errors.push('provide non-empty text or html content');

  if (Number.isNaN(scheduledAt.getTime())) {
    errors.push('scheduledAt must be a valid date and time');
  } else if (scheduledAt.getTime() <= Date.now()) {
    errors.push('scheduledAt must be in the future');
  }

  if (errors.length) return res.status(400).json({ errors });

  const input: CreateScheduledEmailInput = {
    googleSub: req.user!.sub,
    senderId,
    recipient,
    subject,
    textBody,
    htmlBody,
    scheduledAt,
  };

  try {
    const email = await createScheduledEmail(input);
    try {
      await enqueueEmail(email.id, email.scheduledAt);
    } catch (error) {
      // The row remains in MySQL and startup recovery will enqueue it later.
      console.error('Email saved, but queueing failed:', error);
      return res.status(503).json({ error: 'Email was saved but could not be queued', emailId: email.id });
    }
    return res.status(201).json({ email });
  } catch (error) {
    console.error('Failed to save scheduled email:', error);
    return res.status(500).json({ error: 'Could not save scheduled email' });
  }
});

export { emailsRouter };
