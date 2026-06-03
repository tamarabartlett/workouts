import bcrypt from 'bcryptjs';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireEnv } from '../_lib/env';
import { applyCors, handleOptions, setSessionCookie } from '../_lib/session';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  applyCors(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as { username?: string; password?: string } | undefined;
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  const allowedUser = requireEnv('ALLOWED_USERNAME');
  const allowedHash = requireEnv('ALLOWED_PASSWORD_HASH');

  if (username !== allowedUser || !bcrypt.compareSync(password, allowedHash)) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  setSessionCookie(res, username);
  res.status(200).json({ ok: true });
}
