import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../core/auth.service';
import { WorkoutApiService } from '../../core/workout-api.service';
import type { Workout, WorkoutSetPatchEvent } from './workout.types';
import { WorkoutDayCardComponent } from './workout-day-card/workout-day-card';

@Component({
  selector: 'app-home',
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    WorkoutDayCardComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly workoutsApi = inject(WorkoutApiService);

  protected readonly workouts = signal<Workout[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    this.workoutsApi.list().subscribe({
      next: (rows) => {
        this.workouts.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load workouts. Is the API running and MONGODB_URI set?');
        this.loading.set(false);
      },
    });
  }

  protected parseWorkoutDate(iso: string): Date {
    return new Date(iso);
  }

  protected onSetPatched(workoutId: string, ev: WorkoutSetPatchEvent): void {
    this.workouts.update((list) =>
      list.map((w) =>
        w._id !== workoutId
          ? w
          : {
              ...w,
              exercises: w.exercises.map((ex, exerciseIndex) =>
                exerciseIndex !== ev.exerciseIndex
                  ? ex
                  : {
                      ...ex,
                      sets: ex.sets.map((set, setIndex) =>
                        setIndex !== ev.setIndex
                          ? set
                          : { ...set, reps: ev.reps, weight: ev.weight },
                      ),
                    },
              ),
            },
      ),
    );
    const updated = this.workouts().find((w) => w._id === workoutId);
    if (!updated) {
      return;
    }
    this.workoutsApi.patch(workoutId, { exercises: updated.exercises }).subscribe({
      next: (doc) => {
        this.workouts.update((list) => list.map((w) => (w._id === doc._id ? doc : w)));
      },
      error: () => {
        this.loadError.set('Could not save workout changes.');
        void this.workoutsApi.list().subscribe({ next: (rows) => this.workouts.set(rows) });
      },
    });
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
