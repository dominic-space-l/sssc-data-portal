// The link page: /submit?code=...
// Checks the link, lets the organization pick a form, and sends it for review.
//   New-data link: works for ONE submission, then it's used up.
//   Update link:   "Update existing" (edit their stations and contacts) + "Add new"; works until it expires.

import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DataForm } from '../forms/data-form';
import { FORM_DEFS } from '../forms/form-definitions';
import { FormName, LinkKind, PortalApi } from '../services/portal-api';
import { UpdateRecords } from './update-records';
import { SETTINGS } from '../settings';

@Component({
  selector: 'portal-submit',
  imports: [DataForm, UpdateRecords],
  template: `
    @if (state() === 'checking') {
      <p class="muted">Checking your link…</p>
    } @else if (state() === 'bad') {
      <h1>Link not usable</h1>
      <p class="error">{{ message() }}</p>
      <p class="muted">
        Need a new one? Contact <a [href]="'mailto:' + contact">{{ contact }}</a
        >.
      </p>
    } @else if (state() === 'done') {
      <h1>Submitted</h1>
      <p class="success">{{ message() }}</p>
      <p class="muted">
        This link has now been used. The administrator will review your submission.
      </p>
    } @else if (kind() === 'edit') {
      <h1>Update data{{ orgName() ? ' for ' + orgName() : '' }}</h1>
      <p class="muted">
        This link works until {{ expires() }}. You can send as many changes as you need; each one is
        reviewed before it's saved.
      </p>
      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          [class.active]="mode() === 'update'"
          [attr.aria-selected]="mode() === 'update'"
          (click)="mode.set('update')"
        >
          Update existing
        </button>
        <button
          type="button"
          role="tab"
          [class.active]="mode() === 'new'"
          [attr.aria-selected]="mode() === 'new'"
          (click)="mode.set('new')"
        >
          Add new
        </button>
      </div>
      @if (mode() === 'update') {
        <portal-update-records [code]="code" />
      } @else {
        @if (message()) {
          <p class="success">{{ message() }}</p>
        }
        <div class="tabs" role="tablist">
          @for (f of forms(); track f) {
            <button
              type="button"
              role="tab"
              [class.active]="f === form()"
              [attr.aria-selected]="f === form()"
              (click)="pick(f)"
            >
              {{ title(f) }}
            </button>
          }
        </div>
        @if (form(); as f) {
          <portal-data-form
            [form]="f"
            [code]="code"
            (started)="message.set('')"
            (submitted)="message.set($event)"
          />
        }
      }
    } @else {
      <h1>Submit data{{ orgName() ? ' for ' + orgName() : '' }}</h1>
      <p class="muted">This link works for one submission and expires {{ expires() }}.</p>

      @if (forms().length > 1) {
        <div class="tabs" role="tablist">
          @for (f of forms(); track f) {
            <button
              type="button"
              role="tab"
              [class.active]="f === form()"
              [attr.aria-selected]="f === form()"
              (click)="form.set(f)"
            >
              {{ title(f) }}
            </button>
          }
        </div>
      }
      @if (form(); as f) {
        <portal-data-form [form]="f" [code]="code" (submitted)="finished($event)" />
      }
    }
  `,
})
export class Submit implements OnInit {
  private readonly api = inject(PortalApi);
  private readonly route = inject(ActivatedRoute);
  protected readonly contact = SETTINGS.contactEmail;
  protected code = '';
  protected readonly state = signal<'checking' | 'bad' | 'ready' | 'done'>('checking');
  protected readonly message = signal('');
  protected readonly orgName = signal('');
  protected readonly expires = signal('');
  protected readonly forms = signal<FormName[]>([]);
  protected readonly form = signal<FormName | null>(null);
  protected readonly kind = signal<LinkKind>('new');
  protected readonly mode = signal<'update' | 'new'>('update');

  async ngOnInit() {
    this.code = this.route.snapshot.queryParamMap.get('code') ?? '';
    if (!this.code) {
      this.state.set('bad');
      this.message.set('This page needs the link from your email.');
      return;
    }
    const result = await this.api.checkLink(this.code);
    if (!result.ok) {
      this.state.set('bad');
      this.message.set(result.message);
      return;
    }
    this.kind.set(result.kind ?? 'new');
    this.orgName.set(result.orgName ?? '');
    this.expires.set(new Date(result.expiresAt).toLocaleString());
    this.forms.set(result.forms);
    this.form.set(result.forms[0] ?? null);
    this.state.set('ready');
  }

  protected title(f: FormName) {
    return FORM_DEFS[f].title.replace(/^New /, '').replace(/^./, (c) => c.toUpperCase());
  }

  protected pick(f: FormName) {
    this.form.set(f);
    this.message.set('');
  }

  protected finished(message: string) {
    this.message.set(message);
    this.state.set('done');
  }
}
