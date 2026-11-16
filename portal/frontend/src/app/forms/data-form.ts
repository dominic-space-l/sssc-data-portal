// DataForm: draws a form from form-definitions.ts and submits it.
//   <portal-data-form form="station" />              admin mode: saved straight away
//   <portal-data-form form="station" [code]="code" /> link mode: held for the admin to approve
//   <portal-data-form [custom]="EDIT_DEFS.station" [initial]="values" [send]="fn" />
//                                                    edit mode: filled in with current values, sent with `send`
// All checking happens on the server; its error for a field is shown under that field.

import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FieldDef, FORM_DEFS, FormDef } from './form-definitions';
import { Fields, FormName, FormOptions, PortalApi, Result } from '../services/portal-api';

interface Choice {
  value: string;
  label: string;
}

/** Used when a form has no dropdowns, so there's nothing to load. */
const NO_OPTIONS = {} as FormOptions;

@Component({
  selector: 'portal-data-form',
  templateUrl: './data-form.html',
})
export class DataForm {
  private readonly api = inject(PortalApi);

  /** One of the four new-data forms. */
  readonly form = input<FormName | null>(null);
  /** Or any other form definition (edit forms). */
  readonly custom = input<FormDef | null>(null);
  /** Link code. Leave empty when the admin is logged in. */
  readonly code = input<string | undefined>(undefined);
  /** Starting values (edit forms are filled in with what's saved now). */
  readonly initial = input<Fields>({});
  /** Custom submit (edit forms). Without it, the form is submitted as new data. */
  readonly send = input<((fields: Fields) => Promise<Result<object>>) | null>(null);
  /** Keeps field ids unique when several forms are on one page. */
  readonly idPrefix = input('');
  /** Hide the title and description (small forms inside a list). */
  readonly compact = input(false);
  readonly submitLabel = input('');
  /** Fires after a successful submit with a message to show. */
  readonly submitted = output<string>();

  protected readonly def = computed<FormDef>(
    () => this.custom() ?? FORM_DEFS[this.form() ?? 'station'],
  );
  protected readonly options = signal<FormOptions | null>(null);
  protected readonly values = signal<Fields>({});
  protected readonly fieldError = signal<{ field: string; message: string } | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);

  constructor() {
    // Load the dropdown lists, and reset the form whenever the chosen form changes.
    effect(() => {
      const code = this.code();
      const def = this.def();
      this.values.set({ ...this.initial() });
      this.fieldError.set(null);
      this.error.set('');
      this.notice.set('');
      const needsLists = def.sections.some((s) => s.fields.some((f) => f.options));
      if (needsLists) this.loadOptions(code);
      else this.options.set(NO_OPTIONS);
    });
  }

  private async loadOptions(code?: string) {
    const result = await this.api.formOptions(code);
    if (result.ok) this.options.set(result.options);
    else this.error.set(`Couldn't load the dropdown lists: ${result.message}`);
  }

  protected fid(key: string) {
    return `f-${this.idPrefix()}${key}`;
  }

  protected choices(field: FieldDef): Choice[] {
    const list = field.options ? this.options()?.[field.options] : undefined;
    if (!list) return [];
    return (list as (string | { id: number; name: string })[]).map((item) =>
      typeof item === 'string'
        ? { value: item, label: item }
        : { value: String(item.id), label: item.name },
    );
  }

  protected value(key: string): string {
    const v = this.values()[key];
    return typeof v === 'string'
      ? v
      : v === null || v === undefined || typeof v === 'boolean'
        ? ''
        : String(v);
  }

  protected checked(key: string): boolean {
    return this.values()[key] === true;
  }

  protected set(key: string, value: string | boolean) {
    this.values.update((all) => ({ ...all, [key]: value }));
    if (this.fieldError()?.field === key) this.fieldError.set(null);
    this.notice.set('');
  }

  protected errorFor(key: string): string {
    const e = this.fieldError();
    return e?.field === key ? e.message : '';
  }

  protected buttonText() {
    if (this.busy()) return 'Sending…';
    if (this.submitLabel()) return this.submitLabel();
    if (this.send() || this.code()) return 'Submit for review';
    return 'Save';
  }

  protected async submit(event: Event) {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.fieldError.set(null);

    const send = this.send();
    const result: Result<object> = send
      ? await send(this.values())
      : await this.api.submitForm(this.form() ?? 'station', this.values(), this.code());
    this.busy.set(false);

    if (!result.ok) {
      if (result.field) {
        this.fieldError.set({ field: result.field, message: result.message });
        document.getElementById(this.fid(result.field))?.focus();
      } else {
        this.error.set(result.message);
      }
      return;
    }

    if (send) {
      // Edits keep what was typed, so it's clear what was sent.
      this.notice.set('Sent for review. It will be saved once the administrator approves it.');
      this.submitted.emit('Sent for review.');
      return;
    }
    this.values.set({ ...this.initial() });
    this.submitted.emit(
      this.code()
        ? 'Thanks! Your submission was sent for review.'
        : `Saved (${'saved' in result ? result.saved : 0} rows added).`,
    );
  }
}
