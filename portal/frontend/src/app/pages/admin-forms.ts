// Admin data entry: the input menu (/forms) and one form at a time (/forms/:form).
// Everything the admin submits here is saved straight away (no approval).
// The menu mirrors Elias's input page: "Enter information" (the single combined form) plus the
// four separate forms.

import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { DataForm } from '../forms/data-form';
import { FORM_DEFS } from '../forms/form-definitions';
import { FormName } from '../services/portal-api';

interface MenuItem {
  form: FormName;
  label: string;
  note: string;
}

export const ADMIN_MENU: MenuItem[] = [
  { form: 'main', label: 'Enter information', note: 'Everything about a station in one form.' },
  { form: 'project', label: 'New project', note: 'A project run by an organization.' },
  {
    form: 'organization',
    label: 'New organization',
    note: 'An organization and its main contact.',
  },
  { form: 'station', label: 'New station', note: 'A station for an existing project.' },
  { form: 'device', label: 'New device', note: 'A device model, optionally at a station.' },
];

@Component({
  selector: 'portal-admin-forms',
  imports: [DataForm, RouterLink],
  template: `
    @if (form(); as f) {
      <a routerLink="/forms" class="back">← All forms</a>
      @if (saved()) {
        <p class="success" role="status">{{ saved() }}</p>
      }
      <portal-data-form [form]="f" (submitted)="saved.set($event)" />
    } @else {
      <h1>Add data</h1>
      <p class="muted">Pick a form. Everything you save here is added straight away.</p>
      <div class="cards">
        @for (item of menu; track item.form) {
          <a class="card" [routerLink]="['/forms', item.form]">
            {{ item.label }}
            <span class="muted">{{ item.note }}</span>
          </a>
        }
      </div>
    }
  `,
})
export class AdminForms {
  private readonly route = inject(ActivatedRoute);
  protected readonly menu = ADMIN_MENU;
  protected readonly saved = signal('');

  private readonly param = toSignal(this.route.paramMap.pipe(map((p) => p.get('form'))));
  /** The form in the address, if it's a real one. */
  protected readonly form = computed<FormName | null>(() => {
    const name = this.param();
    return name && name in FORM_DEFS ? (name as FormName) : null;
  });

  constructor() {
    // Clear the "Saved" message when switching forms.
    effect(() => {
      this.form();
      this.saved.set('');
    });
  }
}
