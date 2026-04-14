import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-home',
  imports: [MatToolbarModule, MatButtonModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
