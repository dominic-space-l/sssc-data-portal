// "Update existing" tab of the link page (update links only).
// Shows the organization's stations (where it's Primary Owner, Secondary Owner or Maintainer) and its contacts.
// Each form is filled in with what's saved now; every change is sent for the administrator to approve.

import { Component, inject, input, OnInit, signal } from '@angular/core';
import { DataForm } from '../forms/data-form';
import { EDIT_DEFS } from '../forms/form-definitions';
import { EditKind, Fields, MyRecords, PortalApi, StationDetails } from '../services/portal-api';

type Selected = { type: 'station'; id: number } | { type: 'contact'; id: number } | null;

@Component({
  selector: 'portal-update-records',
  imports: [DataForm],
  templateUrl: './update-records.html',
})
export class UpdateRecords implements OnInit {
  private readonly api = inject(PortalApi);
  readonly code = input.required<string>();

  protected readonly defs = EDIT_DEFS;
  protected readonly records = signal<MyRecords | null>(null);
  protected readonly selected = signal<Selected>(null);
  protected readonly details = signal<StationDetails | null>(null);
  protected readonly error = signal('');
  protected readonly loading = signal(false);

  async ngOnInit() {
    const result = await this.api.myRecords(this.code());
    if (result.ok) this.records.set(result);
    else this.error.set(result.message);
  }

  protected async openStation(id: number) {
    this.initials.clear();
    this.selected.set({ type: 'station', id });
    this.details.set(null);
    this.error.set('');
    this.loading.set(true);
    const result = await this.api.stationDetails(this.code(), id);
    this.loading.set(false);
    if (result.ok) this.details.set(result);
    else this.error.set(result.message);
  }

  protected openContact(id: number) {
    this.initials.clear();
    this.selected.set({ type: 'contact', id });
    this.details.set(null);
    this.error.set('');
  }

  protected back() {
    this.selected.set(null);
    this.details.set(null);
  }

  protected isSelected(type: 'station' | 'contact', id: number) {
    const s = this.selected();
    return s?.type === type && s.id === id;
  }

  protected selectedContact() {
    const s = this.selected();
    return s?.type === 'contact'
      ? (this.records()?.contacts.find((c) => c.id === s.id) ?? null)
      : null;
  }

  protected contactValues(c: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    notes: string | null;
  }): Fields {
    return {
      Email: c.email,
      FirstName: c.firstName ?? '',
      LastName: c.lastName ?? '',
      ContactNotes: c.notes ?? '',
    };
  }

  protected deviceValues(d: { serialNumber: string | null }): Fields {
    return { SerialNumber: d.serialNumber ?? '', Remove: false };
  }

  protected sensorValues(s: {
    count: number | null;
    placementHeightMeters: number | null;
    placementNotes: string | null;
  }): Fields {
    return {
      Count: s.count === null ? '' : String(s.count),
      PlacementHeightMeters:
        s.placementHeightMeters === null ? '' : String(s.placementHeightMeters),
      PlacementNotes: s.placementNotes ?? '',
      Remove: false,
    };
  }

  /** Makes the `send` function for one form: which kind of edit, and which record. */
  protected sender(edit: EditKind, target: Record<string, unknown>) {
    return (fields: Fields) => this.api.submitEdit(this.code(), edit, target, fields);
  }

  // Each form gets one stable sender, so it isn't rebuilt (and reset) on every redraw.
  private readonly senders = new Map<
    string,
    (fields: Fields) => ReturnType<PortalApi['submitEdit']>
  >();
  protected send(edit: EditKind, target: Record<string, unknown>) {
    const key = edit + JSON.stringify(target);
    if (!this.senders.has(key)) this.senders.set(key, this.sender(edit, target));
    return this.senders.get(key)!;
  }

  private readonly initials = new Map<string, Fields>();
  /** Same idea for starting values: one stable object per record (reset when another record is opened). */
  protected start(key: string, values: Fields) {
    if (!this.initials.has(key)) this.initials.set(key, values);
    return this.initials.get(key)!;
  }
}
