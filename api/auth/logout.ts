import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, clearSessionCookie, handleOptions } from '../_lib/session';

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

  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
