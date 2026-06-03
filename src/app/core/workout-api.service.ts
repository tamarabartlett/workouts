import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Workout } from '../pages/home/workout.types';

export interface WorkoutDataResponse {
  workouts: Workout[];
  customExerciseNames: string[];
  updatedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class WorkoutApiService {
  private readonly http = inject(HttpClient);

  fetchWorkouts(): Promise<WorkoutDataResponse> {
    return firstValueFrom(this.http.get<WorkoutDataResponse>('/api/workouts'));
  }

  saveWorkouts(workouts: Workout[], customExerciseNames: string[]): Promise<void> {
    return firstValueFrom(
      this.http.put<void>('/api/workouts', { workouts, customExerciseNames }),
    );
  }
}
