import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WorkoutStoreService } from '../../../core/workout-store.service';
import { NewWorkoutFormComponent } from '../new-workout-form/new-workout-form';
import type { Workout, WorkoutSetPatchEvent } from '../workout.types';
import { WorkoutDayCardComponent } from '../workout-day-card/workout-day-card';

type MainView = 'welcome' | 'new' | 'edit';

@Component({
  selector: 'app-home-main',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    NewWorkoutFormComponent,
    WorkoutDayCardComponent,
  ],
  templateUrl: './home-main.html',
  styleUrl: './home-main.scss',
})
export class HomeMainComponent {
  private readonly store = inject(WorkoutStoreService);

  readonly mainView = input.required<MainView>();
  readonly selectedWorkout = input<Workout | null>(null);
  readonly statusMessage = input<string | null>(null);
  readonly statusKind = input<'info' | 'error'>('info');

  protected readonly workouts = this.store.workouts;
  protected readonly lastExerciseSessions = this.store.lastExerciseSessions;
  protected readonly nextWorkoutDefaults = this.store.nextWorkoutDefaults;

  readonly dismissStatus = output<void>();
  readonly save = output<Workout>();
  readonly cancel = output<void>();
  readonly patchSet = output<WorkoutSetPatchEvent>();
  readonly noteChange = output<string>();
  readonly startNewWorkout = output<void>();

  protected parseWorkoutDate(iso: string): Date {
    return new Date(iso);
  }
}
