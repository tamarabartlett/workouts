import { BreakpointObserver } from '@angular/cdk/layout';
import {
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import { findImportConflicts } from '../../core/import-merge';
import {
  WORKOUT_HISTORY_FILENAME,
  WorkoutStoreService,
} from '../../core/workout-store.service';
import { HomeMainComponent } from './home-main/home-main';
import { ImportConflictDialogComponent } from './import-conflict-dialog/import-conflict-dialog';
import { PastWorkoutsComponent } from './past-workouts/past-workouts';
import type { Workout, WorkoutSetPatchEvent } from './workout.types';

/**
 * Min width at which the workouts sidenav stays pinned open as a permanent
 * column. Below this we switch to an overlay sidenav toggled by a hamburger.
 */
const SIDENAV_BREAKPOINT = '(min-width: 960px)';

type MainView = 'welcome' | 'new' | 'edit';

@Component({
  selector: 'app-home',
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    HomeMainComponent,
    PastWorkoutsComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly store = inject(WorkoutStoreService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly workouts = this.store.workouts;
  protected readonly storeReady = this.store.ready;
  protected readonly storeLoadError = this.store.loadError;
  protected readonly storeSaveError = this.store.saveError;
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly statusKind = signal<'info' | 'error'>('info');

  /** Currently selected workout id; drives the 'edit' view in the main pane. */
  protected readonly selectedWorkoutId = signal<string | null>(null);
  protected readonly selectedWorkout = computed<Workout | null>(() => {
    const id = this.selectedWorkoutId();
    if (!id) return null;
    return this.workouts().find((w) => w.id === id) ?? null;
  });

  /** What the main pane is showing right now. */
  protected readonly mainView = signal<MainView>('welcome');

  /** True when the viewport is wide enough for a permanent sidenav. */
  protected readonly isWideScreen = toSignal(
    this.breakpointObserver
      .observe(SIDENAV_BREAKPOINT)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  /** 'side' = permanent column on wide screens; 'over' = overlay on narrow. */
  protected readonly sidenavMode = computed(() =>
    this.isWideScreen() ? 'side' : 'over',
  );

  /**
   * Default to open on wide screens, closed on narrow. Writable so the
   * hamburger button and overlay backdrop can toggle it on narrow screens
   * without `isWideScreen` snapping it back.
   */
  protected readonly sidenavOpened = linkedSignal(() => this.isWideScreen());

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  ngOnInit(): void {
    void this.store.ensureLoaded();
  }

  protected toggleSidenav(): void {
    this.sidenavOpened.update((v) => !v);
  }

  protected onSidenavOpenedChange(opened: boolean): void {
    this.sidenavOpened.set(opened);
  }

  /**
   * Return to the home view that shows the "Next workout" summary (or the
   * welcome state when there's no history yet). Wired to the toolbar brand.
   */
  protected goToNextWorkout(): void {
    this.selectedWorkoutId.set(null);
    this.mainView.set('welcome');
    this.closeSidenavIfOverlay();
  }

  /** Switch the main pane to the new-workout form. Auto-closes overlay sidenav. */
  protected startNewWorkout(): void {
    this.selectedWorkoutId.set(null);
    this.mainView.set('new');
    this.closeSidenavIfOverlay();
  }

  /** Select an existing workout for editing in the main pane. */
  protected selectWorkout(id: string): void {
    this.selectedWorkoutId.set(id);
    this.mainView.set('edit');
    this.closeSidenavIfOverlay();
  }

  protected onSetPatched(workoutId: string, ev: WorkoutSetPatchEvent): void {
    const current = this.workouts().find((w) => w.id === workoutId);
    if (!current) return;
    const exercises = current.exercises.map((ex, exerciseIndex) =>
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
    );
    this.store.patchExercises(workoutId, exercises);
  }

  protected onNoteChanged(workoutId: string, note: string): void {
    this.store.patchNote(workoutId, note);
  }

  protected onSelectedWorkoutSetPatched(ev: WorkoutSetPatchEvent): void {
    const id = this.selectedWorkoutId();
    if (!id) return;
    this.onSetPatched(id, ev);
  }

  protected onSelectedWorkoutNoteChanged(note: string): void {
    const id = this.selectedWorkoutId();
    if (!id) return;
    this.onNoteChanged(id, note);
  }

  protected onNewWorkoutSaved(workout: Workout): void {
    this.store.addWorkout(workout);
    this.flashStatus(
      'info',
      `Added new workout with ${workout.exercises.length} exercise(s).`,
    );
    this.selectedWorkoutId.set(workout.id);
    this.mainView.set('edit');
  }

  protected onNewWorkoutCancelled(): void {
    this.mainView.set('welcome');
  }

  protected exportHistory(): void {
    const json = JSON.stringify(this.store.toHistoryFile(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = WORKOUT_HISTORY_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.flashStatus('info', `Exported ${this.workouts().length} workout(s).`);
  }

  protected triggerImport(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await this.store.ensureLoaded();
      const text = await file.text();
      const imported = this.store.parseHistoryText(text);
      const conflicts = findImportConflicts(this.workouts(), imported);

      if (conflicts.length > 0) {
        const ref = this.dialog.open(ImportConflictDialogComponent, {
          data: { conflicts },
          disableClose: true,
          maxWidth: '96vw',
        });
        const result = await firstValueFrom(ref.afterClosed());
        if (!result) return;
        await this.store.applyImport(imported, result.resolutions);
      } else {
        await this.store.applyImport(imported);
      }

      this.flashStatus('info', `Imported ${imported.length} workout(s).`);
      this.selectedWorkoutId.set(null);
      this.mainView.set('welcome');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error.';
      this.flashStatus('error', `Import failed: ${message}`);
    }
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  private flashStatus(kind: 'info' | 'error', message: string): void {
    this.statusKind.set(kind);
    this.statusMessage.set(message);
  }

  /** Clear the status banner. Wired to the banner's close button. */
  protected dismissStatus(): void {
    this.statusMessage.set(null);
  }

  /**
   * On narrow screens the sidenav is an overlay; after the user picks an
   * action we close it so the main pane is fully visible.
   */
  private closeSidenavIfOverlay(): void {
    if (!this.isWideScreen()) this.sidenavOpened.set(false);
  }
}
