import mongoose, { Schema } from 'mongoose';

export interface WorkoutSetInput {
  reps: number;
  weight: number;
  weightUnit: string;
}

export interface WorkoutExerciseInput {
  name: string;
  sets: WorkoutSetInput[];
}

export interface WorkoutData {
  date: Date;
  exercises: WorkoutExerciseInput[];
}

const workoutSetSchema = new Schema(
  {
    reps: { type: Number, required: true, min: 1 },
    weight: { type: Number, required: true, min: 0 },
    weightUnit: { type: String, required: true },
  },
  { _id: false },
);

const exerciseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sets: {
      type: [workoutSetSchema],
      required: true,
      validate: {
        validator(v: unknown[]) {
          return Array.isArray(v) && v.length >= 1 && v.length <= 5;
        },
        message: 'Each exercise must have between 1 and 5 sets',
      },
    },
  },
  { _id: false },
);

const workoutSchema = new Schema(
  {
    date: { type: Date, required: true },
    exercises: {
      type: [exerciseSchema],
      required: true,
      validate: {
        validator(v: unknown[]) {
          return Array.isArray(v) && v.length >= 1;
        },
        message: 'A workout must include at least one exercise',
      },
    },
  },
  { timestamps: true, collection: 'workouts' },
);

export const Workout =
  (mongoose.models.Workout as mongoose.Model<WorkoutData>) ||
  mongoose.model<WorkoutData>('Workout', workoutSchema);
