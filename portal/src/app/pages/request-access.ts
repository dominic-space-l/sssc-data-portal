// Request access: outside organizations ask for a one-time link.
// Cloudflare Turnstile (the bot check) is loaded only on this page.

import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { PortalApi } from '../services/portal-api';
import { SETTINGS } from '../settings';

interface Turnstile {
  render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }): string;
  reset(id?: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile; } }

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject()));
    script.addEventListener('error', () => reject());
  });
}

@Component({
  selector: 'portal-request-access',
  template: `
    <h1>Request access</h1>
    @if (done()) {
      <p class="success">Thanks! Your request was sent. If it's approved, you'll get an email with a link.</p>
    } @else {
      <p class="muted">Ask for a link to submit data. The administrator reviews every request.</p>
      <form class="narrow" (submit)="send($event, org.value, name.value, email.value, reason.value)">
        <fieldset class="choice">
          <legend>What would you like to do?</legend>
          <label><input type="radio" name="kind" value="new" [checked]="kind() === 'new'" (change)="kind.set('new')" />
            Add new data</label>
          <label><input type="radio" name="kind" value="edit" [checked]="kind() === 'edit'" (change)="kind.set('edit')" />
            Update data we already have (contacts, stations, devices, sensors)</label>
        </fieldset>
        <div class="field">
          <label for="org">Organization name <span class="req">*</span></label>
          <input #org id="org" required maxlength="200" />
        </div>
        <div class="field">
          <label for="name">Your name</label>
          <input #name id="name" maxlength="200" />
        </div>
        <div class="field">
          <label for="email">Email <span class="req">*</span></label>
          <input #email id="email" type="email" required />
        </div>
        <div class="field">
          <label for="reason">{{ kind() === 'edit' ? 'What would you like to update?' : 'What would you like to submit?' }}</label>
          <textarea #reason id="reason" rows="3" maxlength="2000"></textarea>
        </div>
        <div #captcha class="captcha"></div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button type="submit" [disabled]="busy() || !token()">{{ busy() ? 'Sending…' : 'Send request' }}</button>
      </form>
      <p class="muted">Questions? Contact <a [href]="'mailto:' + contact">{{ contact }}</a>.</p>
    }
  `,
})
export class RequestAccess implements AfterViewInit, OnDestroy {
  private readonly api = inject(PortalApi);
  private readonly captcha = viewChild<ElementRef<HTMLElement>>('captcha');
  private widgetId?: string;
  protected readonly contact = SETTINGS.contactEmail;
  protected readonly token = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly kind = signal<'new' | 'edit'>('new');

  async ngAfterViewInit() {
    try {
      const turnstile = await loadTurnstile();
      const el = this.captcha()?.nativeElement;
      if (!el) return;
      this.widgetId = turnstile.render(el, {
        sitekey: SETTINGS.turnstileSiteKey,
        callback: (t) => this.token.set(t),
        'expired-callback': () => this.token.set(''),
      });
    } catch {
      this.error.set("The bot check couldn't load. Check your connection and refresh the page.");
    }
  }

  ngOnDestroy() {
    if (this.widgetId) window.turnstile?.remove(this.widgetId);
  }

  protected async send(event: Event, orgName: string, contactName: string, email: string, reason: string) {
    event.preventDefault();
    this.busy.set(true);
    this.error.set('');
    const result = await this.api.requestAccess({ orgName, contactName, email, reason, turnstileToken: this.token(), kind: this.kind() });
    this.busy.set(false);
    if (result.ok) {
      this.done.set(true);
      return;
    }
    this.error.set(result.message);
    // Each bot-check token works once, so get a fresh one.
    this.token.set('');
    window.turnstile?.reset(this.widgetId);
  }
}
