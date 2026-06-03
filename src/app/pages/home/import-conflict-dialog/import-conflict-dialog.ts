import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import type { ImportResolution, WorkoutDateConflict } from '../../../core/import-merge';

export interface ImportConflictDialogData {
  conflicts: WorkoutDateConflict[];
}

export interface ImportConflictDialogResult {
  resolutions: Record<string, ImportResolution>;
}

@Component({
  selector: 'app-import-conflict-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatRadioModule],
  templateUrl: './import-conflict-dialog.html',
  styleUrl: './import-conflict-dialog.scss',
})
export class ImportConflictDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<ImportConflictDialogComponent, ImportConflictDialogResult>>(
      MatDialogRef,
    );
  protected readonly data = inject<ImportConflictDialogData>(MAT_DIALOG_DATA);

  /** Per dateKey: which version to keep. */
  protected readonly choices = signal<Record<string, ImportResolution>>(
    Object.fromEntries(
      this.data.conflicts.map((c) => [c.dateKey, 'existing' as ImportResolution]),
    ),
  );

  protected setChoice(dateKey: string, choice: ImportResolution): void {
    this.choices.update((prev) => ({ ...prev, [dateKey]: choice }));
  }

  protected choiceFor(dateKey: string): ImportResolution {
    return this.choices()[dateKey] ?? 'existing';
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  protected confirm(): void {
    this.dialogRef.close({ resolutions: this.choices() });
  }
}
