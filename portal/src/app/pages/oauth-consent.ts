// /oauth/consent?authorization_id=...
// Shown when someone connects Claude (or another AI app) to the portal's data.
// The admin must be logged in (the route guard sends them to /login first), then clicks Allow or Deny.
// Allowing gives that app READ-ONLY access, acting as this admin.

import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConsentRequest, PortalApi } from '../services/portal-api';

@Component({
  selector: 'portal-oauth-consent',
  template: `
    <h1>Connect an app</h1>
    @if (state() === 'loading') {
      <p class="muted">Loading…</p>
    } @else if (state() === 'error') {
      <p class="error">{{ error() }}</p>
      <p class="muted">Go back to the app and try connecting again.</p>
    } @else if (state() === 'leaving') {
      <p class="muted">Sending you back to the app…</p>
    } @else if (request(); as r) {
      <div class="narrow">
        <p><strong>{{ r.clientName || 'An app' }}</strong> wants to connect to the Data Portal as
          <strong>{{ r.email }}</strong>.</p>
        @if (r.clientUri) { <p class="muted">{{ r.clientUri }}</p> }
        <p>If you allow it, it can <strong>read</strong> stations, projects, organizations, contacts and devices to answer
          your questions. It cannot add, change or delete anything.</p>
        <p class="muted">Only allow apps you just tried to connect yourself.</p>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <div class="actions">
          <button type="button" [disabled]="busy()" (click)="decide(true)">Allow</button>
          <button type="button" class="secondary" [disabled]="busy()" (click)="decide(false)">Deny</button>
        </div>
      </div>
    }
  `,
})
export class OAuthConsent implements OnInit {
  private readonly api = inject(PortalApi);
  private readonly route = inject(ActivatedRoute);
  private id = '';
  protected readonly state = signal<'loading' | 'ready' | 'error' | 'leaving'>('loading');
  protected readonly request = signal<ConsentRequest | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  async ngOnInit() {
    this.id = this.route.snapshot.queryParamMap.get('authorization_id') ?? '';
    if (!this.id) {
      this.fail('This page needs an authorization_id. It opens automatically when you connect an app.');
      return;
    }
    const result = await this.api.oauthRequest(this.id);
    if (!result.ok) return this.fail(result.message);
    if (result.redirectUrl) return this.leave(result.redirectUrl); // already allowed before
    this.request.set(result.request!);
    this.state.set('ready');
  }

  protected async decide(allow: boolean) {
    this.busy.set(true);
    this.error.set('');
    const result = await this.api.oauthDecide(this.id, allow);
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.message);
      return;
    }
    this.leave(result.redirectUrl);
  }

  private leave(url: string) {
    this.state.set('leaving');
    window.location.assign(url);
  }

  private fail(message: string) {
    this.error.set(message);
    this.state.set('error');
  }
}
