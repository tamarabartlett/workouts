import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { WorkoutStoreService } from '../../../core/workout-store.service';
import type { Exercise, NextWorkoutDefaults, Workout } from '../workout.types';

/** Sentinel value for the "write in a different exercise" dropdown option. */
const OTHER_VALUE = '__other__';

/** Default unit used when nothing has been chosen before. */
const DEFAULT_UNIT = 'lb';

interface DraftExercise {
  name: string;
  reps: number;
  weight: number;
  weightUnit: string;
}

@Component({
  selector: 'app-new-workout-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './new-workout-form.html',
  styleUrl: './new-workout-form.scss',
})
export class NewWorkoutFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(WorkoutStoreService);

  /**
   * Last reps/weight/unit per exercise (from {@link WorkoutStoreService.lastExerciseSessions}).
   * Passed from the parent so the form pre-fills when the user picks an exercise.
   */
  readonly nextWorkoutDefaults = input.required<ReadonlyMap<string, NextWorkoutDefaults>>();

  /** Emitted when the user saves a complete workout. */
  readonly save = output<Workout>();
  /** Emitted when the user discards the in-progress workout. */
  readonly cancel = output<void>();

  protected readonly OTHER_VALUE = OTHER_VALUE;
  protected readonly nowIso = new Date().toISOString();

  /** Names known to the app, sorted by most-recently-used (from the store). */
  protected readonly knownNames = this.store.exerciseNames;

  protected readonly draftExercises = signal<DraftExercise[]>([]);
  protected readonly canSave = computed(() => this.draftExercises().length > 0);

  /** Optional free-form note attached to the new workout. */
  protected readonly noteCtrl = this.fb.nonNullable.control('');

  /**
   * Form for adding a single exercise to the draft list. The custom-name field
   * is only required when "Other" is selected; this is enforced by the
   * subscription below that toggles its validator dynamically.
   */
  protected readonly addExerciseForm = this.fb.nonNullable.group({
    selectedName: ['', Validators.required],
    customName: [''],
    reps: [5, [Validators.required, Validators.min(0)]],
    weight: [0, [Validators.required, Validators.min(0)]],
    weightUnit: [DEFAULT_UNIT, Validators.required],
  });

  protected readonly isOther = signal(false);

  constructor() {
    this.addExerciseForm.controls.selectedName.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((val) => this.onSelectedNameChange(val));
  }

  ngOnInit(): void {
    // Inputs are available here; default-select the most recently used exercise.
    const first = this.knownNames()[0] ?? OTHER_VALUE;
    this.addExerciseForm.patchValue({ selectedName: first });
    this.onSelectedNameChange(first);
  }

  /**
   * Reacts to the exercise dropdown changing: keeps `isOther` and the
   * customName validator in sync, and prefills reps/weight/unit from the
   * last time the user did the selected exercise so they only have to
   * adjust deltas (or confirm) before adding it to the draft.
   */
  private onSelectedNameChange(val: string): void {
    const other = val === OTHER_VALUE;
    this.isOther.set(other);

    const customCtrl = this.addExerciseForm.controls.customName;
    if (other) {
      customCtrl.setValidators([Validators.required]);
    } else {
      customCtrl.clearValidators();
      customCtrl.setValue('');
    }
    customCtrl.updateValueAndValidity({ emitEvent: false });

    if (other) return;
    const last = this.nextWorkoutDefaults().get(val);
    if (!last) return;
    this.addExerciseForm.patchValue(
      { reps: last.reps, weight: last.weight, weightUnit: last.weightUnit },
      { emitEvent: false },
    );
  }

  protected addExercise(): void {
    if (this.addExerciseForm.invalid) {
      this.addExerciseForm.markAllAsTouched();
      return;
    }
    const { selectedName, customName, reps, weight, weightUnit } =
      this.addExerciseForm.getRawValue();
    const name =
      selectedName === OTHER_VALUE ? customName.trim() : selectedName.trim();
    if (!name) return;

    if (selectedName === OTHER_VALUE) {
      // Remember the new name immediately so it appears in the dropdown on
      // future opens even if the user discards this draft.
      this.store.rememberCustomExerciseName(name);
    }

    this.draftExercises.update((list) => [
      ...list,
      { name, reps, weight, weightUnit },
    ]);

    // Reset for the next add, keeping the previously chosen unit so users
    // adding multiple lb (or kg) exercises don't have to re-pick each time.
    const nextSelected = this.knownNames()[0] ?? OTHER_VALUE;
    this.addExerciseForm.reset({
      selectedName: nextSelected,
      customName: '',
      reps: 5,
      weight: 0,
      weightUnit,
    });
    this.onSelectedNameChange(nextSelected);
  }

  protected removeDraft(index: number): void {
    this.draftExercises.update((list) => list.filter((_, i) => i !== index));
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  protected onSave(): void {
    if (!this.canSave()) return;
    const exercises: Exercise[] = this.draftExercises().map((d) => ({
      name: d.name,
      sets: [{ reps: d.reps, weight: d.weight, weightUnit: d.weightUnit }],
    }));
    const note = this.noteCtrl.value.trim();
    const workout: Workout = {
      id: newId(),
      date: this.nowIso,
      exercises,
      ...(note ? { note } : {}),
    };
    this.save.emit(workout);
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
