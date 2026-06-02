import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WorkoutStoreService } from '../../../core/workout-store.service';
import type { Workout } from '../workout.types';

type MainView = 'welcome' | 'new' | 'edit';

@Component({
  selector: 'app-past-workouts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule],
  templateUrl: './past-workouts.html',
  styleUrl: './past-workouts.scss',
})
export class PastWorkoutsComponent {
  private readonly store = inject(WorkoutStoreService);

  readonly selectedWorkoutId = input<string | null>(null);
  readonly mainView = input<MainView>('welcome');

  protected readonly workouts = this.store.workouts;

  readonly startNewWorkout = output<void>();
  readonly selectWorkout = output<string>();

  protected parseWorkoutDate(iso: string): Date {
    return new Date(iso);
  }

  /** Compact summary shown next to each workout item in the sidenav. */
  protected summarize(w: Workout): string {
    const exerciseCount = w.exercises.length;
    const setCount = w.exercises.reduce((n, ex) => n + ex.sets.length, 0);
    return `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} · ${setCount} set${setCount === 1 ? '' : 's'}`;
  }
}
