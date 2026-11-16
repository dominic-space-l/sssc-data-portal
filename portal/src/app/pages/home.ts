import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalApi } from '../services/portal-api';
import { SETTINGS } from '../settings';

@Component({
  selector: 'portal-home',
  imports: [RouterLink],
  template: `
    <h1>Environmental Monitoring Data Portal</h1>
    <p>This portal is used to add monitoring stations, devices, projects and organizations to the shared database.</p>

    @if (api.user()) {
      <div class="cards">
        <a class="card" routerLink="/forms">Add data <span class="muted">Fill in a form; it is saved straight away.</span></a>
        <a class="card" routerLink="/admin">Dashboard <span class="muted">Review access requests and submissions.</span></a>
      </div>
    } @else {
      <div class="cards">
        <a class="card" routerLink="/request-access">Request access
          <span class="muted">Outside organizations: ask for a one-time link to submit data.</span></a>
        <a class="card" routerLink="/login">Admin login <span class="muted">For the portal administrator.</span></a>
      </div>
      <p class="muted">Already have a link? Open it directly from your email.
        Questions? Contact <a [href]="'mailto:' + contact">{{ contact }}</a>.</p>
    }
  `,
})
export class Home {
  protected readonly api = inject(PortalApi);
  protected readonly contact = SETTINGS.contactEmail;
}
