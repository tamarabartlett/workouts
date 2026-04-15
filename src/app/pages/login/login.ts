import { isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { AuthService } from '../../core/auth.service';

const LS_USERNAME = 'workouts_remember_username';
const LS_PASSWORD = 'workouts_remember_password';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatRadioModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    /** `true` = remember username and password in localStorage */
    rememberMe: [false],
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const savedUser = localStorage.getItem(LS_USERNAME);
    const savedPass = localStorage.getItem(LS_PASSWORD);
    if (savedUser !== null && savedPass !== null) {
      this.form.patchValue({
        username: savedUser,
        password: savedPass,
        rememberMe: true,
      });
    }
  }

  protected submit(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password, rememberMe } = this.form.getRawValue();
    if (this.auth.login(username, password)) {
      if (isPlatformBrowser(this.platformId)) {
        if (rememberMe) {
          localStorage.setItem(LS_USERNAME, username);
          localStorage.setItem(LS_PASSWORD, password);
        } else {
          localStorage.removeItem(LS_USERNAME);
          localStorage.removeItem(LS_PASSWORD);
        }
      }
      void this.router.navigateByUrl('/home');
    } else {
      this.error.set('Invalid username or password.');
    }
  }
}
