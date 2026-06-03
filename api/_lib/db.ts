import { MongoClient, type Db } from 'mongodb';
import { requireEnv } from './env';

const COLLECTION = 'workout_app';
const DOC_ID = 'main';

export interface StoredWorkoutData {
  workouts: unknown[];
  customExerciseNames: string[];
  updatedAt: string;
}

declare global {
  // eslint-disable-next-line no-var
  var _workoutsMongo: { client: MongoClient; db: Db } | undefined;
}

async function connect(): Promise<Db> {
  if (global._workoutsMongo) {
    return global._workoutsMongo.db;
  }
  const uri = requireEnv('MONGODB_URI');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  global._workoutsMongo = { client, db };
  return db;
}

export async function loadWorkoutData(): Promise<StoredWorkoutData | null> {
  const db = await connect();
  const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID });
  if (!doc) return null;
  return {
    workouts: Array.isArray(doc['workouts']) ? doc['workouts'] : [],
    customExerciseNames: Array.isArray(doc['customExerciseNames'])
      ? (doc['customExerciseNames'] as string[])
      : [],
    updatedAt:
      typeof doc['updatedAt'] === 'string'
        ? doc['updatedAt']
        : new Date().toISOString(),
  };
}

export async function saveWorkoutData(data: StoredWorkoutData): Promise<void> {
  const db = await connect();
  await db.collection(COLLECTION).updateOne(
    { _id: DOC_ID },
    {
      $set: {
        workouts: data.workouts,
        customExerciseNames: data.customExerciseNames,
        updatedAt: data.updatedAt,
      },
    },
    { upsert: true },
  );
}
