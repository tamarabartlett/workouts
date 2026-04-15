import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Exercise as ExerciseModel, WorkoutSetPatchEvent } from '../workout.types';

@Component({
  selector: 'app-exercise',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exercise.html',
  styleUrl: './exercise.scss',
})
export class ExerciseComponent {
  readonly exercise = input.required<ExerciseModel>();
  /** Index of this exercise in the parent workout list (for patch events). */
  readonly exerciseIndex = input.required<number>();
  /** When true, reps and weight are editable; otherwise read-only. */
  readonly editable = input(false);

  readonly patchSet = output<WorkoutSetPatchEvent>();

  protected onRepsChange(setIndex: number, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    const reps = Number.isFinite(value) ? value : 0;
    const set = this.exercise().sets[setIndex];
    this.patchSet.emit({
      exerciseIndex: this.exerciseIndex(),
      setIndex,
      reps,
      weight: set.weight,
    });
  }

  protected onWeightChange(setIndex: number, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    const weight = Number.isFinite(value) ? value : 0;
    const set = this.exercise().sets[setIndex];
    this.patchSet.emit({
      exerciseIndex: this.exerciseIndex(),
      setIndex,
      reps: set.reps,
      weight,
    });
  }
}
