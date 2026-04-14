import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
    canActivate: [guestGuard],
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
    canActivate: [authGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
];
