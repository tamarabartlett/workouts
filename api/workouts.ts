import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectMongo } from './lib/connectMongo';
import { Workout, type WorkoutData } from './lib/workoutModel';

function jsonBody(req: VercelRequest): unknown {
  const b = req.body;
  if (b == null) {
    return undefined;
  }
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return undefined;
    }
  }
  return b;
}

function isExerciseLike(x: unknown): x is { name: string; sets: unknown[] } {
  if (x === null || typeof x !== 'object') {
    return false;
  }
  const o = x as Record<string, unknown>;
  return typeof o.name === 'string' && Array.isArray(o.sets);
}

function isSetLike(x: unknown): x is { reps: number; weight: number; weightUnit: string } {
  if (x === null || typeof x !== 'object') {
    return false;
  }
  const o = x as Record<string, unknown>;
  return (
    typeof o.reps === 'number' &&
    typeof o.weight === 'number' &&
    typeof o.weightUnit === 'string'
  );
}

function validatePayload(body: unknown): WorkoutData | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const o = body as Record<string, unknown>;
  const dateRaw = o.date;
  const exercisesRaw = o.exercises;
  if (typeof dateRaw !== 'string' && !(dateRaw instanceof Date)) {
    return null;
  }
  if (!Array.isArray(exercisesRaw) || exercisesRaw.length === 0) {
    return null;
  }
  const exercises: WorkoutData['exercises'] = [];
  for (const ex of exercisesRaw) {
    if (!isExerciseLike(ex)) {
      return null;
    }
    if (ex.sets.length < 1 || ex.sets.length > 5) {
      return null;
    }
    const sets: WorkoutData['exercises'][0]['sets'] = [];
    for (const s of ex.sets) {
      if (!isSetLike(s)) {
        return null;
      }
      sets.push({
        reps: s.reps,
        weight: s.weight,
        weightUnit: s.weightUnit,
      });
    }
    exercises.push({ name: ex.name.trim(), sets });
  }
  const date = typeof dateRaw === 'string' ? new Date(dateRaw) : dateRaw;
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return { date, exercises };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    await connectMongo();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database connection failed' });
    return;
  }

  if (req.method === 'GET') {
    const docs = await Workout.find().sort({ date: -1 }).lean().exec();
    res.status(200).json(docs);
    return;
  }

  if (req.method === 'POST') {
    const body = jsonBody(req);
    const parsed = validatePayload(body);
    if (!parsed) {
      res.status(400).json({
        error: 'Invalid body: expected { date: ISO string, exercises: [{ name, sets: [{ reps, weight, weightUnit }] }] }',
      });
      return;
    }
    const created = await Workout.create(parsed);
    res.status(201).json(created.toJSON());
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  res.status(405).json({ error: 'Method not allowed' });
}
