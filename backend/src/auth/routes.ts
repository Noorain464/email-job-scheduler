import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { clearedSessionCookie, createSessionCookie, readSession } from './session.js';
import { createPasswordUser, verifyPasswordUser } from './users.js';

export const authRouter = express.Router();

authRouter.post('/signup', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Name must be between 2 and 120 characters' });
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be between 8 and 128 characters' });

  try {
    const user = await createPasswordUser(name, email, password);
    res.setHeader('Set-Cookie', createSessionCookie({ ...user, picture: null }));
    return res.status(201).json({ user: { name: user.name, email: user.email, picture: null } });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }
    console.error('Account signup failed:', error);
    return res.status(500).json({ error: 'Could not create your account' });
  }
});

authRouter.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const user = await verifyPasswordUser(email, password);
    if (!user) return res.status(401).json({ error: 'Email or password is incorrect' });
    res.setHeader('Set-Cookie', createSessionCookie({ ...user, picture: null }));
    return res.json({ user: { name: user.name, email: user.email, picture: null } });
  } catch (error) {
    console.error('Password sign-in failed:', error);
    return res.status(500).json({ error: 'Could not sign in' });
  }
});

authRouter.post('/google', async (req, res) => {
  const credential = req.body && typeof req.body.credential === 'string' ? req.body.credential : '';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!credential) return res.status(400).json({ error: 'Google credential is required' });
  if (!clientId || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'Google sign-in is not configured on the server' });
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return res.status(401).json({ error: 'Google account could not be verified' });
    }

    const cookie = createSessionCookie({
      sub: payload.sub,
      name: payload.name ?? payload.email,
      email: payload.email,
      picture: payload.picture ?? null,
    });
    res.setHeader('Set-Cookie', cookie);
    return res.json({ user: { name: payload.name ?? payload.email, email: payload.email, picture: payload.picture ?? null } });
  } catch (error) {
    console.error('Google sign-in verification failed:', error);
    return res.status(401).json({ error: 'Google sign-in could not be verified' });
  }
});

authRouter.get('/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  return res.json({ user: { name: user.name, email: user.email, picture: user.picture } });
});

authRouter.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearedSessionCookie);
  return res.status(204).end();
});
