import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

export type AuthenticatedUser = {
  sub: string;
  name: string;
  email: string;
  picture: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const COOKIE_NAME = 'outbox_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

export function createSessionCookie(user: AuthenticatedUser): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + SESSION_SECONDS * 1000 })).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function readSession(req: Request): AuthenticatedUser | null {
  try {
    const cookieHeader = req.headers.cookie ?? '';
    const token = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
    if (!token) return null;

    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthenticatedUser & { exp?: number };
    if (!data.sub || !data.email || !data.exp || data.exp <= Date.now()) return null;
    return { sub: data.sub, name: data.name, email: data.email, picture: data.picture ?? null };
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  req.user = user;
  next();
};

export const clearedSessionCookie = `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
