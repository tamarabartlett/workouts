import { Injectable, signal } from '@angular/core';
import * as bcrypt from 'bcryptjs';
import { ALLOWED_PASSWORD_HASH, ALLOWED_USERNAME } from '../../auth-secrets.generated';

const STORAGE_KEY = 'workouts_authenticated';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authenticated = signal(this.readStorage());

  isLoggedIn(): boolean {
    return this.authenticated();
  }

  login(username: string, password: string): boolean {
    const userOk = username.trim() === ALLOWED_USERNAME;
    const passwordOk = bcrypt.compareSync(password, ALLOWED_PASSWORD_HASH);

    if (!userOk || !passwordOk) {
      return false;
    }

    sessionStorage.setItem(STORAGE_KEY, '1');
    this.authenticated.set(true);
    return true;
  }

  logout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this.authenticated.set(false);
  }

  private readStorage(): boolean {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  }
}
