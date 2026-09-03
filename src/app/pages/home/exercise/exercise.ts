import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type {
  Exercise as ExerciseModel,
  WorkoutExerciseIndexEvent,
  WorkoutSetIndexEvent,
  WorkoutSetPatchEvent,
} from '../workout.types';

@Component({
  selector: 'app-exercise',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './exercise.html',
  styleUrl: './exercise.scss',
})
export class ExerciseComponent {
  readonly exercise = input.required<ExerciseModel>();
  /** Index of this exercise in the parent workout list (for patch events). */
  readonly exerciseIndex = input.required<number>();
  /** When true, reps and weight are editable; otherwise read-only. */
  readonly editable = input(false);
  /** When false, the remove-exercise control is hidden (workout must keep at least one). */
  readonly canRemoveExercise = input(true);

  readonly patchSet = output<WorkoutSetPatchEvent>();
  readonly addSet = output<WorkoutExerciseIndexEvent>();
  readonly removeSet = output<WorkoutSetIndexEvent>();
  readonly removeExercise = output<WorkoutExerciseIndexEvent>();

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

  protected onAddSet(): void {
    this.addSet.emit({ exerciseIndex: this.exerciseIndex() });
  }

  protected onRemoveSet(setIndex: number): void {
    this.removeSet.emit({ exerciseIndex: this.exerciseIndex(), setIndex });
  }

  protected onRemoveExercise(): void {
    this.removeExercise.emit({ exerciseIndex: this.exerciseIndex() });
  }
}
