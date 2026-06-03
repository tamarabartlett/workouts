import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  Exercise,
  LastExerciseSession,
  NextWorkoutDefaults,
  Workout,
  WorkoutHistoryFile,
  WorkoutSet,
} from '../pages/home/workout.types';
import type { ImportResolution } from './import-merge';
import { mergeImportedWorkouts } from './import-merge';
import { WorkoutApiService } from './workout-api.service';

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
  private readonly api = inject(WorkoutApiService);

  private readonly _workouts = signal<Workout[]>([]);
  readonly workouts = this._workouts.asReadonly();

  private readonly _customExerciseNames = signal<string[]>([]);

  /** False until the first load from MongoDB completes (or fails). */
  readonly ready = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);

  /**
   * Exercise names entered by the user via "Other" that have not yet been
   * saved into a workout. Persisted so the dropdown remembers them.
   * Stored most-recently-added first.
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

  private loadPromise: Promise<void> | null = null;

  /** Load workouts from MongoDB (call after the user is authenticated). */
  ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.initFromApi();
    }
    return this.loadPromise;
  }

  /** Load workouts from MongoDB; migrate legacy localStorage once if needed. */
  private async initFromApi(): Promise<void> {
    try {
      const data = await this.api.fetchWorkouts();
      let workouts = sortByDateDesc(
        data.workouts.map((w) => normalizeWorkoutFromApi(w)),
      );
      let customNames = data.customExerciseNames;

      if (workouts.length === 0) {
        const local = this.readLocalStorage();
        if (local) {
          workouts = local.workouts;
          customNames = local.customExerciseNames;
          await this.api.saveWorkouts(workouts, customNames);
        }
      }

      this._workouts.set(workouts);
      this._customExerciseNames.set(customNames);
      this.loadError.set(null);
    } catch (err) {
      const local = this.readLocalStorage();
      if (local) {
        this._workouts.set(local.workouts);
        this._customExerciseNames.set(local.customExerciseNames);
        this.loadError.set(null);
      } else {
        const message =
          err instanceof Error ? err.message : 'Could not load workouts.';
        this.loadError.set(message);
      }
    } finally {
      this.ready.set(true);
    }
  }

  /** Replace the exercises array for an existing workout (used by the edit UI). */
  patchExercises(id: string, exercises: Exercise[]): void {
    this._workouts.update((list) =>
      list.map((w) => (w.id === id ? { ...w, exercises } : w)),
    );
    void this.persist();
  }

  patchNote(id: string, note: string): void {
    const trimmed = note.trim();
    this._workouts.update((list) =>
      list.map((w) => {
        if (w.id !== id) return w;
        if (trimmed) return { ...w, note: trimmed };
        const { note: _omit, ...rest } = w;
        return rest;
      }),
    );
    void this.persist();
  }

  addWorkout(workout: Workout): void {
    this._workouts.update((list) => sortByDateDesc([workout, ...list]));
    const names = new Set(workout.exercises.map((e) => e.name));
    this._customExerciseNames.update((list) => list.filter((n) => !names.has(n)));
    void this.persist();
  }

  rememberCustomExerciseName(rawName: string): void {
    const name = rawName.trim();
    if (!name) return;
    if (this.exerciseNames().includes(name)) return;
    this._customExerciseNames.update((list) => [name, ...list]);
    void this.persist();
  }

  /**
   * Replace history after import. When `resolutions` is empty, imported
   * workouts are merged without overwriting existing dates.
   */
  async applyImport(
    imported: Workout[],
    resolutions: Record<string, ImportResolution> = {},
  ): Promise<void> {
    if (!this.ready()) {
      await this.ensureLoaded();
    }
    const merged = mergeImportedWorkouts(this._workouts(), imported, resolutions);
    this._workouts.set(sortByDateDesc(merged));
    await this.persistAndSync();
  }

  /** Replace the entire in-memory history (used when import has no conflicts). */
  async replaceAll(workouts: Workout[]): Promise<void> {
    if (!this.ready()) {
      await this.ensureLoaded();
    }
    this._workouts.set(sortByDateDesc(workouts));
    await this.persistAndSync();
  }

  toHistoryFile(): WorkoutHistoryFile {
    return {
      version: WORKOUT_HISTORY_VERSION,
      exportedAt: new Date().toISOString(),
      workouts: this._workouts(),
    };
  }

  parseHistoryText(text: string): Workout[] {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('File is not valid JSON.');
    }
    return normalizeHistory(raw);
  }

  /** Background save for edits; always writes localStorage, then syncs to the API. */
  private persist(): void {
    this.writeLocalStorage();
    void this.syncToApi().catch(() => {
      // saveError is set in syncToApi
    });
  }

  /** Awaited after import so failures surface and storage is flushed first. */
  private async persistAndSync(): Promise<void> {
    this.writeLocalStorage();
    await this.syncToApi();
  }

  private async syncToApi(): Promise<void> {
    try {
      await this.api.saveWorkouts(this._workouts(), this._customExerciseNames());
      this.saveError.set(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not save workouts.';
      this.saveError.set(message);
      throw err;
    }
  }

  private writeLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toHistoryFile()));
      localStorage.setItem(
        CUSTOM_NAMES_STORAGE_KEY,
        JSON.stringify(this._customExerciseNames()),
      );
    } catch {
      // quota / privacy mode — ignore
    }
  }

  private readLocalStorage(): {
    workouts: Workout[];
    customExerciseNames: string[];
  } | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const workouts = sortByDateDesc(normalizeHistory(JSON.parse(raw)));
      let customExerciseNames: string[] = [];
      const namesRaw = localStorage.getItem(CUSTOM_NAMES_STORAGE_KEY);
      if (namesRaw) {
        const parsed: unknown = JSON.parse(namesRaw);
        if (Array.isArray(parsed)) {
          customExerciseNames = parsed
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            .map((v) => v.trim());
        }
      }
      return { workouts, customExerciseNames };
    } catch {
      return null;
    }
  }
}

function normalizeWorkoutFromApi(w: Workout): Workout {
  return {
    ...w,
    date: new Date(w.date).toISOString(),
    exercises: w.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({ ...s, weightUnit: s.weightUnit.trim() })),
    })),
  };
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
