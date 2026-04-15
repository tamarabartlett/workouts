import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectMongo } from '../lib/connectMongo';
import { Workout, type WorkoutData } from '../lib/workoutModel';

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

function validateExercises(body: unknown): WorkoutData['exercises'] | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const o = body as Record<string, unknown>;
  const exercisesRaw = o.exercises;
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
  return exercises;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid workout id' });
    return;
  }

  try {
    await connectMongo();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database connection failed' });
    return;
  }

  if (req.method === 'PATCH') {
    const body = jsonBody(req);
    const exercises = validateExercises(body);
    if (!exercises) {
      res.status(400).json({
        error: 'Invalid body: expected { exercises: [{ name, sets: [{ reps, weight, weightUnit }] }] }',
      });
      return;
    }
    const updated = await Workout.findByIdAndUpdate(
      id,
      { $set: { exercises } },
      { new: true, runValidators: true, lean: true },
    ).exec();
    if (!updated) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    res.status(200).json(updated);
    return;
  }

  res.setHeader('Allow', 'PATCH, OPTIONS');
  res.status(405).json({ error: 'Method not allowed' });
}
