import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { Exercise, WorkoutSetPatchEvent } from '../workout.types';
import { ExerciseComponent } from '../exercise/exercise';

@Component({
  selector: 'app-workout-day-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    DatePipe,
    ExerciseComponent,
  ],
  templateUrl: './workout-day-card.html',
  styleUrl: './workout-day-card.scss',
})
export class WorkoutDayCardComponent {
  /** Workout session date (shown in the card title). */
  readonly date = input.required<Date>();
  readonly exercises = input.required<Exercise[]>();
  /** Free-form note attached to the workout (may be empty). */
  readonly note = input<string>('');

  /** When true, reps and weights can be edited; otherwise read-only. */
  protected readonly isEditing = signal(false);

  /** Fired when the user changes reps or weight while editing. */
  readonly patchSet = output<WorkoutSetPatchEvent>();
  /** Fired when the user edits the note while in edit mode. */
  readonly noteChange = output<string>();

  protected toggleEditing(): void {
    this.isEditing.update((v) => !v);
  }

  protected onNoteInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.noteChange.emit(value);
  }
}
