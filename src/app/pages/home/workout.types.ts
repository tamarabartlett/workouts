export interface WorkoutSet {
  reps: number;
  weight: number;
  /** e.g. "lb", "kg" */
  weightUnit: string;
}

export interface Exercise {
  name: string;
  /** Typically 1–5 sets */
  sets: WorkoutSet[];
}

/** Workout document from the API / MongoDB */
export interface Workout {
  _id: string;
  /** ISO date string from JSON */
  date: string;
  exercises: Exercise[];
  createdAt?: string;
  updatedAt?: string;
}

/** Emitted when reps or weight for a set is edited (immutable updates in parent). */
export interface WorkoutSetPatchEvent {
  exerciseIndex: number;
  setIndex: number;
  reps: number;
  weight: number;
}
