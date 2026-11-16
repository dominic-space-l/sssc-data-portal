import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PortalApi } from './services/portal-api';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'portal-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly api = inject(PortalApi);
  private readonly router = inject(Router);

  constructor() {
    this.api.getUser(); // show the right menu on first load
  }

  protected async logout() {
    await this.api.logout();
    await this.router.navigateByUrl('/');
  }
}
