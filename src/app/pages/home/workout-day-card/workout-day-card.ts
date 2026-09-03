import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { WorkoutStoreService } from '../../../core/workout-store.service';
import { ExerciseComponent } from '../exercise/exercise';
import type {
  Exercise,
  WorkoutExerciseIndexEvent,
  WorkoutSetIndexEvent,
  WorkoutSetPatchEvent,
} from '../workout.types';

/** Sentinel value for the "write in a different exercise" dropdown option. */
const OTHER_VALUE = '__other__';

@Component({
  selector: 'app-workout-day-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    DatePipe,
    ExerciseComponent,
  ],
  templateUrl: './workout-day-card.html',
  styleUrl: './workout-day-card.scss',
})
export class WorkoutDayCardComponent {
  private readonly store = inject(WorkoutStoreService);

  /** Workout session date (shown in the card title). */
  readonly date = input.required<Date>();
  readonly exercises = input.required<Exercise[]>();
  /** Free-form note attached to the workout (may be empty). */
  readonly note = input<string>('');

  /** When true, reps and weights can be edited; otherwise read-only. */
  protected readonly isEditing = signal(false);

  protected readonly OTHER_VALUE = OTHER_VALUE;
  protected readonly selectedExerciseName = signal('');
  protected readonly customExerciseName = signal('');
  protected readonly isOtherExercise = computed(
    () => this.selectedExerciseName() === OTHER_VALUE,
  );
  protected readonly exerciseSelectNames = computed(() =>
    [...this.store.exerciseNames()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    ),
  );
  protected readonly canRemoveExercise = computed(() => this.exercises().length > 1);

  /** Fired when the user changes reps or weight while editing. */
  readonly patchSet = output<WorkoutSetPatchEvent>();
  /** Fired when the user edits the note while in edit mode. */
  readonly noteChange = output<string>();
  readonly addSet = output<WorkoutExerciseIndexEvent>();
  readonly removeSet = output<WorkoutSetIndexEvent>();
  readonly removeExercise = output<WorkoutExerciseIndexEvent>();
  readonly addExercise = output<Exercise>();

  protected toggleEditing(): void {
    this.isEditing.update((editing) => {
      const next = !editing;
      if (next) {
        this.resetAddExerciseForm();
      }
      return next;
    });
  }

  protected onNoteInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.noteChange.emit(value);
  }

  protected onSelectedExerciseChange(name: string): void {
    this.selectedExerciseName.set(name);
    if (name !== OTHER_VALUE) {
      this.customExerciseName.set('');
    }
  }

  protected onCustomExerciseNameInput(event: Event): void {
    this.customExerciseName.set((event.target as HTMLInputElement).value);
  }

  protected onAddExercise(): void {
    const selected = this.selectedExerciseName();
    const name =
      selected === OTHER_VALUE
        ? this.customExerciseName().trim()
        : selected.trim();
    if (!name) return;

    if (selected === OTHER_VALUE) {
      this.store.rememberCustomExerciseName(name);
    }

    const defaults = this.store.nextWorkoutDefaults().get(name);
    const reps = defaults?.reps ?? 5;
    const weight = defaults?.weight ?? 0;
    const weightUnit = defaults?.weightUnit ?? 'lb';

    this.addExercise.emit({
      name,
      sets: [{ reps, weight, weightUnit }],
    });
    this.resetAddExerciseForm();
  }

  private resetAddExerciseForm(): void {
    const first = this.store.exerciseNames()[0] ?? OTHER_VALUE;
    this.selectedExerciseName.set(first);
    this.customExerciseName.set('');
  }
}
