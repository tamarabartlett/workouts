import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Exercise, Workout } from '../pages/home/workout.types';
import { Observable } from 'rxjs';

export interface CreateWorkoutPayload {
  date: string;
  exercises: Exercise[];
}

@Injectable({ providedIn: 'root' })
export class WorkoutApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  list(): Observable<Workout[]> {
    return this.http.get<Workout[]>(`${this.base}/workouts`);
  }

  create(body: CreateWorkoutPayload): Observable<Workout> {
    return this.http.post<Workout>(`${this.base}/workouts`, body);
  }

  patch(id: string, body: { exercises: Exercise[] }): Observable<Workout> {
    return this.http.patch<Workout>(`${this.base}/workouts/${encodeURIComponent(id)}`, body);
  }
}
