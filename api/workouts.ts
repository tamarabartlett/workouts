import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadWorkoutData, saveWorkoutData } from './_lib/db';
import { applyCors, handleOptions } from './_lib/session';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  applyCors(req, res);
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    const data = await loadWorkoutData();
    res.status(200).json(
      data ?? {
        workouts: [],
        customExerciseNames: [],
        updatedAt: null,
      },
    );
    return;
  }

  if (req.method === 'PUT') {
    const body = req.body as
      | { workouts?: unknown; customExerciseNames?: unknown }
      | undefined;
    if (!Array.isArray(body?.workouts)) {
      res.status(400).json({ error: 'Expected a workouts array.' });
      return;
    }
    const customExerciseNames = Array.isArray(body.customExerciseNames)
      ? body.customExerciseNames.filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        )
      : [];

    await saveWorkoutData({
      workouts: body.workouts,
      customExerciseNames,
      updatedAt: new Date().toISOString(),
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
