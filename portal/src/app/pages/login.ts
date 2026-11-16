import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalApi } from '../services/portal-api';

@Component({
  selector: 'portal-login',
  template: `
    <h1>Admin login</h1>
    <form class="narrow" (submit)="login($event, email.value, password.value)">
      <div class="field">
        <label for="email">Email</label>
        <input #email id="email" type="email" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input #password id="password" type="password" autocomplete="current-password" required />
      </div>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <button type="submit" [disabled]="busy()">{{ busy() ? 'Logging in…' : 'Log in' }}</button>
    </form>
  `,
})
export class Login {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected async login(event: Event, email: string, password: string) {
    event.preventDefault();
    this.busy.set(true);
    this.error.set('');
    const result = await this.api.login(email.trim(), password);
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    // Only follow ?next= to a page on this site.
    const next = this.route.snapshot.queryParamMap.get('next') ?? '';
    await this.router.navigateByUrl(next.startsWith('/') && !next.startsWith('//') ? next : '/admin');
  }
}
