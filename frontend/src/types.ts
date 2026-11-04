export type User = {
  name: string;
  email: string;
  picture: string | null;
};

export type EmailRecord = {
  id: string;
  senderId: string;
  recipient: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  scheduledAt: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type ScheduleEmailInput = {
  senderId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  scheduledAt: string;
};

export type EmailSender = { id: string; from: string };

