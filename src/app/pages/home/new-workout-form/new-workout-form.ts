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
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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

interface DraftSet {
  reps: number;
  weight: number;
}

interface DraftExercise {
  name: string;
  sets: DraftSet[];
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
   * Last reps/weight per exercise (from {@link WorkoutStoreService.lastExerciseSessions}).
   * Passed from the parent so the form pre-fills when the user picks an exercise.
   */
  readonly nextWorkoutDefaults = input.required<ReadonlyMap<string, NextWorkoutDefaults>>();

  /** Emitted when the user saves a complete workout. */
  readonly save = output<Workout>();
  /** Emitted when the user discards the in-progress workout. */
  readonly cancel = output<void>();

  protected readonly OTHER_VALUE = OTHER_VALUE;
  protected readonly nowIso = new Date().toISOString();

  /** Most recently used exercise names (from the store). */
  private readonly storeExerciseNames = this.store.exerciseNames;

  /** Exercise names for the dropdown, sorted A–Z. */
  protected readonly exerciseSelectNames = computed(() =>
    [...this.storeExerciseNames()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    ),
  );

  protected readonly draftExercises = signal<DraftExercise[]>([]);
  protected readonly editingDraftIndex = signal<number | null>(null);
  protected readonly canSave = computed(() => this.draftExercises().length > 0);
  protected readonly isEditingDraft = computed(() => this.editingDraftIndex() !== null);

  /** Skips last-session prefill while loading a draft row into the form. */
  private suppressNameChangePrefill = false;

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
    sets: this.fb.nonNullable.array([this.createSetGroup(5, 0)]),
  });

  protected get setsArray(): FormArray<FormGroup> {
    return this.addExerciseForm.controls.sets;
  }

  protected readonly isOther = signal(false);

  constructor() {
    this.addExerciseForm.controls.selectedName.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((val) => this.onSelectedNameChange(val));
  }

  ngOnInit(): void {
    // Inputs are available here; default-select the most recently used exercise.
    const first = this.storeExerciseNames()[0] ?? OTHER_VALUE;
    this.addExerciseForm.patchValue({ selectedName: first });
    this.onSelectedNameChange(first);
  }

  /**
   * Reacts to the exercise dropdown changing: keeps `isOther` and the
   * customName validator in sync, and prefills reps/weight from the
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

    if (this.suppressNameChangePrefill || other) return;
    const last = this.nextWorkoutDefaults().get(val);
    if (!last) return;
    const first = this.setsArray.at(0);
    if (first) {
      first.patchValue(
        { reps: last.reps, weight: last.weight },
        { emitEvent: false },
      );
    } else {
      this.resetSets(last.reps, last.weight);
    }
  }

  protected addSet(): void {
    const sets = this.setsArray;
    const { reps, weight } = sets.at(sets.length - 1).getRawValue();
    sets.push(this.createSetGroup(reps, weight));
  }

  protected removeSet(index: number): void {
    if (this.setsArray.length <= 1) return;
    this.setsArray.removeAt(index);
  }

  protected addExercise(): void {
    if (this.addExerciseForm.invalid) {
      this.addExerciseForm.markAllAsTouched();
      return;
    }
    const { selectedName, customName, sets } = this.addExerciseForm.getRawValue();
    const name =
      selectedName === OTHER_VALUE ? customName.trim() : selectedName.trim();
    if (!name) return;

    if (selectedName === OTHER_VALUE) {
      // Remember the new name immediately so it appears in the dropdown on
      // future opens even if the user discards this draft.
      this.store.rememberCustomExerciseName(name);
    }

    const draftSets: DraftSet[] = sets.map(({ reps, weight }) => ({ reps, weight }));
    const editingIndex = this.editingDraftIndex();
    if (editingIndex !== null) {
      this.draftExercises.update((list) => {
        const next = [...list];
        next[editingIndex] = { name, sets: draftSets };
        return next;
      });
      this.editingDraftIndex.set(null);
    } else {
      this.draftExercises.update((list) => [...list, { name, sets: draftSets }]);
    }

    this.resetAddExerciseForm();
  }

  protected editDraft(index: number): void {
    const ex = this.draftExercises()[index];
    if (!ex) return;
    this.editingDraftIndex.set(index);
    this.loadDraftIntoForm(ex);
  }

  private loadDraftIntoForm(ex: DraftExercise): void {
    this.suppressNameChangePrefill = true;
    const isKnown = this.exerciseSelectNames().includes(ex.name);
    if (isKnown) {
      this.addExerciseForm.patchValue({ selectedName: ex.name, customName: '' });
      this.onSelectedNameChange(ex.name);
    } else {
      this.addExerciseForm.patchValue({
        selectedName: OTHER_VALUE,
        customName: ex.name,
      });
      this.onSelectedNameChange(OTHER_VALUE);
    }
    this.loadSetsIntoForm(ex.sets);
    this.suppressNameChangePrefill = false;
  }

  private loadSetsIntoForm(sets: DraftSet[]): void {
    this.setsArray.clear({ emitEvent: false });
    for (const set of sets) {
      this.setsArray.push(this.createSetGroup(set.reps, set.weight), {
        emitEvent: false,
      });
    }
  }

  private resetAddExerciseForm(): void {
    const nextSelected = this.storeExerciseNames()[0] ?? OTHER_VALUE;
    this.addExerciseForm.patchValue({
      selectedName: nextSelected,
      customName: '',
    });
    this.resetSets(5, 0);
    this.onSelectedNameChange(nextSelected);
  }

  private createSetGroup(reps: number, weight: number): FormGroup {
    return this.fb.nonNullable.group({
      reps: [reps, [Validators.required, Validators.min(0)]],
      weight: [weight, [Validators.required, Validators.min(0)]],
    });
  }

  private resetSets(reps = 5, weight = 0): void {
    this.setsArray.clear({ emitEvent: false });
    this.setsArray.push(this.createSetGroup(reps, weight), { emitEvent: false });
  }

  protected removeDraft(index: number): void {
    this.draftExercises.update((list) => list.filter((_, i) => i !== index));
    const editing = this.editingDraftIndex();
    if (editing === null) return;
    if (editing === index) {
      this.editingDraftIndex.set(null);
      this.resetAddExerciseForm();
    } else if (editing > index) {
      this.editingDraftIndex.set(editing - 1);
    }
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  protected onSave(): void {
    if (!this.canSave()) return;
    const exercises: Exercise[] = this.draftExercises().map((d) => ({
      name: d.name,
      sets: d.sets.map((s) => ({ ...s, weightUnit: 'lb' })),
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
