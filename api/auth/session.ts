import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleOptions, readSession } from '../_lib/session';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  applyCors(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true, user: session.user });
}
