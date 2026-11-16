// Admin "Add data": the admin fills in any form; it is saved straight away (no approval).

import { Component, signal } from '@angular/core';
import { DataForm } from '../forms/data-form';
import { FORM_DEFS } from '../forms/form-definitions';
import { FormName } from '../services/portal-api';

@Component({
  selector: 'portal-admin-forms',
  imports: [DataForm],
  template: `
    <h1>Add data</h1>
    <div class="tabs" role="tablist">
      @for (f of forms; track f) {
        <button type="button" role="tab" [class.active]="f === form()" [attr.aria-selected]="f === form()"
                (click)="pick(f)">{{ title(f) }}</button>
      }
    </div>
    @if (saved()) { <p class="success">{{ saved() }}</p> }
    <portal-data-form [form]="form()" (submitted)="saved.set($event)" />
  `,
})
export class AdminForms {
  protected readonly forms = Object.keys(FORM_DEFS) as FormName[];
  protected readonly form = signal<FormName>('station');
  protected readonly saved = signal('');

  protected pick(f: FormName) {
    this.form.set(f);
    this.saved.set('');
  }

  protected title(f: FormName) {
    return FORM_DEFS[f].title.replace(/^New /, '').replace(/^./, (c) => c.toUpperCase());
  }
}
