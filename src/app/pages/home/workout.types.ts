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

/** A single workout session as stored in `workoutHistory.json`. */
export interface Workout {
  id: string;
  date: string;
  exercises: Exercise[];
  /**
   * Free-form note the user can attach to the session (e.g. "felt strong",
   * "tweaked left shoulder"). Optional; absent/empty means no note.
   */
  note?: string;
}

/** Top-level shape of `workoutHistory.json`. */
export interface WorkoutHistoryFile {
  version: number;
  exportedAt: string;
  workouts: Workout[];
}

/**
 * Suggested defaults for the next time a given exercise is performed.
 * Currently derived from the last set of the most recent workout that
 * contained the exercise, and used to pre-fill the new-workout dialog so
 * users don't have to re-enter the weight they were lifting last session.
 */
export interface NextWorkoutDefaults {
  reps: number;
  weight: number;
  weightUnit: string;
}

/**
 * The most recent set performed for a given exercise, including the date
 * of the workout it happened in. Used to render the "Next workout" summary
 * on the home screen.
 */
export interface LastExerciseSession {
  name: string;
  reps: number;
  weight: number;
  weightUnit: string;
  /** ISO date string of the workout the last set was performed in. */
  date: string;
}

/** Emitted when reps or weight is edited (immutable updates in parent). */
export interface WorkoutSetPatchEvent {
  exerciseIndex: number;
  setIndex: number;
  reps: number;
  weight: number;
}

/** Identifies an exercise in a workout list (for add/remove exercise events). */
export interface WorkoutExerciseIndexEvent {
  exerciseIndex: number;
}

/** Identifies a set within an exercise (for remove-set events). */
export interface WorkoutSetIndexEvent {
  exerciseIndex: number;
  setIndex: number;
}
