import type { Exercise, Workout, WorkoutSet } from '../pages/home/workout.types';

export type ImportResolution = 'existing' | 'imported';

export interface ExerciseDiff {
  name: string;
  existingSummary: string;
  importedSummary: string;
}

export interface WorkoutDiffSummary {
  existingNote: string;
  importedNote: string;
  onlyInExisting: string[];
  onlyInImported: string[];
  changedExercises: ExerciseDiff[];
}

export interface WorkoutDateConflict {
  dateKey: string;
  dateLabel: string;
  existing: Workout;
  imported: Workout;
  summary: WorkoutDiffSummary;
}

/** Calendar day in the user's local timezone (YYYY-MM-DD). */
export function workoutDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatWorkoutDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function summarizeExercise(ex: Exercise): string {
  return ex.sets.map(formatSet).join('; ');
}

function formatSet(s: WorkoutSet): string {
  return `${s.reps} × ${s.weight} ${s.weightUnit}`;
}

function comparePayload(w: Workout): string {
  return JSON.stringify({
    note: w.note ?? '',
    exercises: w.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets,
    })),
  });
}

export function workoutsContentEqual(a: Workout, b: Workout): boolean {
  return comparePayload(a) === comparePayload(b);
}

export function buildWorkoutDiffSummary(
  existing: Workout,
  imported: Workout,
): WorkoutDiffSummary {
  const existingByName = new Map(existing.exercises.map((ex) => [ex.name, ex]));
  const importedByName = new Map(imported.exercises.map((ex) => [ex.name, ex]));
  const onlyInExisting: string[] = [];
  const onlyInImported: string[] = [];
  const changedExercises: ExerciseDiff[] = [];

  for (const name of existingByName.keys()) {
    if (!importedByName.has(name)) onlyInExisting.push(name);
  }
  for (const name of importedByName.keys()) {
    if (!existingByName.has(name)) onlyInImported.push(name);
  }
  for (const [name, exA] of existingByName) {
    const exB = importedByName.get(name);
    if (!exB) continue;
    if (summarizeExercise(exA) !== summarizeExercise(exB)) {
      changedExercises.push({
        name,
        existingSummary: summarizeExercise(exA),
        importedSummary: summarizeExercise(exB),
      });
    }
  }

  return {
    existingNote: existing.note ?? '',
    importedNote: imported.note ?? '',
    onlyInExisting,
    onlyInImported,
    changedExercises,
  };
}

/** One existing workout per calendar day (most recent timestamp wins). */
export function indexWorkoutsByDate(workouts: Workout[]): Map<string, Workout> {
  const byDate = new Map<string, Workout>();
  for (const w of workouts) {
    const key = workoutDateKey(w.date);
    const prev = byDate.get(key);
    if (!prev || Date.parse(w.date) > Date.parse(prev.date)) {
      byDate.set(key, w);
    }
  }
  return byDate;
}

export function findImportConflicts(
  existing: Workout[],
  imported: Workout[],
): WorkoutDateConflict[] {
  const byDate = indexWorkoutsByDate(existing);
  const conflicts: WorkoutDateConflict[] = [];
  const seenKeys = new Set<string>();

  for (const imp of imported) {
    const key = workoutDateKey(imp.date);
    if (seenKeys.has(key)) continue;
    const ex = byDate.get(key);
    if (!ex) continue;
    if (workoutsContentEqual(ex, imp)) continue;
    seenKeys.add(key);
    conflicts.push({
      dateKey: key,
      dateLabel: formatWorkoutDateLabel(imp.date),
      existing: ex,
      imported: imp,
      summary: buildWorkoutDiffSummary(ex, imp),
    });
  }

  return conflicts.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * Merge imported workouts into existing history using per-date conflict
 * resolutions. Non-conflicting imported workouts are appended; dates the
 * user marks "imported" replace the stored workout for that day.
 */
export function mergeImportedWorkouts(
  existing: Workout[],
  imported: Workout[],
  resolutions: Record<string, ImportResolution>,
): Workout[] {
  const resolutionKeys = new Set(Object.keys(resolutions));
  const keptExisting = existing.filter((w) => {
    const key = workoutDateKey(w.date);
    return resolutions[key] !== 'imported';
  });

  const result = [...keptExisting];
  const resultDateKeys = new Set(result.map((w) => workoutDateKey(w.date)));

  for (const w of imported) {
    const key = workoutDateKey(w.date);
    if (resolutionKeys.has(key)) {
      if (resolutions[key] === 'imported') {
        result.push(w);
        resultDateKeys.add(key);
      }
      continue;
    }
    if (!resultDateKeys.has(key)) {
      result.push(w);
      resultDateKeys.add(key);
    }
  }

  return sortByDateDesc(result);
}

function sortByDateDesc(list: Workout[]): Workout[] {
  return [...list].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
