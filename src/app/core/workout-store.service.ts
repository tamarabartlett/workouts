import { Injectable, computed, signal } from '@angular/core';
import type {
  Exercise,
  LastExerciseSession,
  NextWorkoutDefaults,
  Workout,
  WorkoutHistoryFile,
  WorkoutSet,
} from '../pages/home/workout.types';

/**
 * Current `workoutHistory.json` schema version. Bump if the on-disk shape
 * changes in a backwards-incompatible way and add a migration here.
 */
export const WORKOUT_HISTORY_VERSION = 1;

/** Filename suggested when exporting. */
export const WORKOUT_HISTORY_FILENAME = 'workoutHistory.json';

const STORAGE_KEY = 'workouts_history_v1';
const CUSTOM_NAMES_STORAGE_KEY = 'workouts_custom_exercise_names_v1';

@Injectable({ providedIn: 'root' })
export class WorkoutStoreService {
  private readonly _workouts = signal<Workout[]>([]);
  readonly workouts = this._workouts.asReadonly();

  /**
   * Exercise names entered by the user via "Other" that have not yet been
   * saved into a workout. Persisted so the dropdown remembers them.
   * Stored most-recently-added first.
   */
  private readonly _customExerciseNames = signal<string[]>([]);

  /**
   * Distinct exercise names known to the app, sorted by most recently used.
   * "Used" means the most recent workout date the name appears in; custom
   * names that have never been saved into a workout sort above all of those
   * (they were just typed in, so they are the most recent thing the user
   * touched).
   */
  readonly exerciseNames = computed<string[]>(() => {
    const lastUsed = new Map<string, number>();
    for (const w of this._workouts()) {
      const t = Date.parse(w.date);
      if (Number.isNaN(t)) continue;
      for (const ex of w.exercises) {
        const prev = lastUsed.get(ex.name);
        if (prev === undefined || t > prev) lastUsed.set(ex.name, t);
      }
    }
    const fromWorkouts = [...lastUsed.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const unused = this._customExerciseNames().filter((n) => !lastUsed.has(n));
    return [...unused, ...fromWorkouts];
  });

  /**
   * The most recent set performed for each exercise, paired with the
   * workout date it was performed in. Sorted by date descending so the
   * exercises the user touched most recently appear first. Drives both the
   * "Next workout" view on the home screen and the per-name defaults map
   * below.
   */
  readonly lastExerciseSessions = computed<LastExerciseSession[]>(() => {
    const byName = new Map<string, { t: number; entry: LastExerciseSession }>();
    for (const w of this._workouts()) {
      const t = Date.parse(w.date);
      if (Number.isNaN(t)) continue;
      for (const ex of w.exercises) {
        const prev = byName.get(ex.name);
        if (prev && prev.t >= t) continue;
        const lastSet = ex.sets[ex.sets.length - 1];
        if (!lastSet) continue;
        byName.set(ex.name, {
          t,
          entry: {
            name: ex.name,
            reps: lastSet.reps,
            weight: lastSet.weight,
            weightUnit: lastSet.weightUnit,
            date: w.date,
          },
        });
      }
    }
    return [...byName.values()]
      .sort((a, b) => b.t - a.t)
      .map((v) => v.entry);
  });

  /**
   * Suggested defaults for the next workout, keyed by exercise name. The
   * suggestion is taken from the last set of the most recent workout that
   * included the exercise, so the user sees the weight/reps they finished
   * with last time. Names with no history (e.g. custom names typed via
   * "Other" that haven't been saved into a workout) are absent.
   */
  readonly nextWorkoutDefaults = computed<ReadonlyMap<string, NextWorkoutDefaults>>(
    () => {
      const result = new Map<string, NextWorkoutDefaults>();
      for (const s of this.lastExerciseSessions()) {
        result.set(s.name, {
          reps: s.reps,
          weight: s.weight,
          weightUnit: s.weightUnit,
        });
      }
      return result;
    },
  );

  constructor() {
    this.loadFromStorage();
    this.loadCustomNamesFromStorage();
  }

  /** Replace the exercises array for an existing workout (used by the edit UI). */
  patchExercises(id: string, exercises: Exercise[]): void {
    this._workouts.update((list) =>
      list.map((w) => (w.id === id ? { ...w, exercises } : w)),
    );
    this.persist();
  }

  /**
   * Replace the free-form note on an existing workout. Empty/whitespace input
   * clears the note field entirely so we don't persist meaningless strings.
   */
  patchNote(id: string, note: string): void {
    const trimmed = note.trim();
    this._workouts.update((list) =>
      list.map((w) => {
        if (w.id !== id) return w;
        if (trimmed) return { ...w, note: trimmed };
        // Drop the property when blank instead of storing "".
        const { note: _omit, ...rest } = w;
        return rest;
      }),
    );
    this.persist();
  }

  /** Insert a brand-new workout (used by the New Workout flow). */
  addWorkout(workout: Workout): void {
    this._workouts.update((list) => sortByDateDesc([workout, ...list]));
    // Any custom name now lives inside a real workout, so drop it from the
    // "pending" custom-names list to keep persistence tidy.
    const names = new Set(workout.exercises.map((e) => e.name));
    this._customExerciseNames.update((list) => list.filter((n) => !names.has(n)));
    this.persist();
    this.persistCustomNames();
  }

  /**
   * Remember an exercise name the user typed via "Other" so it shows up in
   * the dropdown next time, even if they cancel the dialog. No-op for names
   * already present in the history or the custom list.
   */
  rememberCustomExerciseName(rawName: string): void {
    const name = rawName.trim();
    if (!name) return;
    if (this.exerciseNames().includes(name)) return;
    this._customExerciseNames.update((list) => [name, ...list]);
    this.persistCustomNames();
  }

  /** Replace the entire in-memory history (used by Import). */
  replaceAll(workouts: Workout[]): void {
    this._workouts.set(sortByDateDesc(workouts));
    this.persist();
  }

  /** Snapshot of the full history in the canonical `workoutHistory.json` shape. */
  toHistoryFile(): WorkoutHistoryFile {
    return {
      version: WORKOUT_HISTORY_VERSION,
      exportedAt: new Date().toISOString(),
      workouts: this._workouts(),
    };
  }

  /**
   * Parse and validate raw text from an uploaded file. Accepts either the
   * canonical `{ version, exportedAt, workouts }` envelope or a bare
   * `Workout[]` array, so that hand-edited or migrated files import cleanly.
   * Throws `Error` with a user-readable message on failure.
   */
  parseHistoryText(text: string): Workout[] {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('File is not valid JSON.');
    }
    return normalizeHistory(raw);
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toHistoryFile()));
    } catch {
      // quota / privacy mode — ignore; the user can still export manually.
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      this._workouts.set(sortByDateDesc(normalizeHistory(JSON.parse(raw))));
    } catch {
      // Corrupt cache — start fresh rather than crashing the app.
    }
  }

  private persistCustomNames(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        CUSTOM_NAMES_STORAGE_KEY,
        JSON.stringify(this._customExerciseNames()),
      );
    } catch {
      // ignore quota / privacy errors
    }
  }

  private loadCustomNamesFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(CUSTOM_NAMES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const names = parsed
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());
      this._customExerciseNames.set(Array.from(new Set(names)));
    } catch {
      // Corrupt cache — start fresh.
    }
  }
}

function sortByDateDesc(list: Workout[]): Workout[] {
  return [...list].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function normalizeHistory(raw: unknown): Workout[] {
  const workoutsRaw: unknown = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray((raw as { workouts?: unknown }).workouts)
      ? (raw as { workouts: unknown[] }).workouts
      : null;

  if (!Array.isArray(workoutsRaw)) {
    throw new Error(
      'Expected an object with a "workouts" array, or a bare array of workouts.',
    );
  }

  return workoutsRaw.map((w, i) => normalizeWorkout(w, i));
}

function normalizeWorkout(raw: unknown, index: number): Workout {
  if (!isRecord(raw)) {
    throw new Error(`workouts[${index}] is not an object.`);
  }
  const dateRaw = raw['date'];
  if (typeof dateRaw !== 'string' || Number.isNaN(Date.parse(dateRaw))) {
    throw new Error(`workouts[${index}].date must be an ISO date string.`);
  }
  const exercisesRaw = raw['exercises'];
  if (!Array.isArray(exercisesRaw) || exercisesRaw.length === 0) {
    throw new Error(`workouts[${index}].exercises must be a non-empty array.`);
  }
  const id = typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : newId();
  const noteRaw = raw['note'];
  const note =
    typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : undefined;
  const out: Workout = {
    id,
    date: new Date(dateRaw).toISOString(),
    exercises: exercisesRaw.map((e, ei) => normalizeExercise(e, index, ei)),
  };
  if (note) out.note = note;
  return out;
}

function normalizeExercise(raw: unknown, wi: number, ei: number): Exercise {
  if (!isRecord(raw)) {
    throw new Error(`workouts[${wi}].exercises[${ei}] is not an object.`);
  }
  const name = raw['name'];
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`workouts[${wi}].exercises[${ei}].name is required.`);
  }
  const setsRaw = raw['sets'];
  if (!Array.isArray(setsRaw) || setsRaw.length === 0) {
    throw new Error(`workouts[${wi}].exercises[${ei}].sets must be a non-empty array.`);
  }
  return {
    name: name.trim(),
    sets: setsRaw.map((s, si) => normalizeSet(s, wi, ei, si)),
  };
}

function normalizeSet(raw: unknown, wi: number, ei: number, si: number): WorkoutSet {
  if (!isRecord(raw)) {
    throw new Error(`workouts[${wi}].exercises[${ei}].sets[${si}] is not an object.`);
  }
  const reps = raw['reps'];
  const weight = raw['weight'];
  const weightUnit = raw['weightUnit'];
  if (typeof reps !== 'number' || !Number.isFinite(reps)) {
    throw new Error(`workouts[${wi}].exercises[${ei}].sets[${si}].reps must be a number.`);
  }
  if (typeof weight !== 'number' || !Number.isFinite(weight)) {
    throw new Error(`workouts[${wi}].exercises[${ei}].sets[${si}].weight must be a number.`);
  }
  if (typeof weightUnit !== 'string' || !weightUnit.trim()) {
    throw new Error(
      `workouts[${wi}].exercises[${ei}].sets[${si}].weightUnit must be a non-empty string.`,
    );
  }
  return { reps, weight, weightUnit: weightUnit.trim() };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
