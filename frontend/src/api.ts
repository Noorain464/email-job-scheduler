import type { EmailRecord, EmailSender, ScheduleEmailInput, User } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error(`Can't reach the backend at ${API_URL}. Start the backend and check VITE_API_URL in frontend/.env.`);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(payload.error ?? `Request failed (${response.status})`, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await request<{ user: User }>('/auth/me');
    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function signInWithGoogle(credential: string): Promise<User> {
  const response = await request<{ user: User }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  return response.user;
}

export async function signInWithPassword(email: string, password: string): Promise<User> {
  const response = await request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return response.user;
}

export async function signUpWithPassword(name: string, email: string, password: string): Promise<User> {
  const response = await request<{ user: User }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  return response.user;
}

export async function signOut(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST' });
}

export async function getEmails(): Promise<EmailRecord[]> {
  const response = await request<{ emails: EmailRecord[] }>('/emails');
  return response.emails;
}

export async function getSenders(): Promise<EmailSender[]> {
  const response = await request<{ senders: EmailSender[] }>('/emails/senders');
  return response.senders;
}

export async function scheduleEmail(email: ScheduleEmailInput): Promise<EmailRecord> {
  const response = await request<{ email: EmailRecord }>('/emails', {
    method: 'POST',
    body: JSON.stringify(email),
  });
  return response.email;
}
