import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';

export const emailQueue = new Queue('scheduled-emails', { connection: createRedisConnection() });

export async function enqueueEmail(emailId: string, scheduledAt: Date): Promise<void> {
  const existingJob = await emailQueue.getJob(emailId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state !== 'failed') return;
    // A failed queue job can be rebuilt only when MySQL still says scheduled.
    await existingJob.remove();
  }

  await emailQueue.add(
    'send-email',
    { emailId },
    {
      // A deterministic ID means recovery won't add a second job for the same email.
      jobId: emailId,
      delay: Math.max(0, scheduledAt.getTime() - Date.now()),
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  );
}
