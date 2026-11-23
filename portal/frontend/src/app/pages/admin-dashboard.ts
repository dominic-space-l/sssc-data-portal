// Admin dashboard: access requests and pending submissions.
// Approving a request creates a link for the admin to email (copy button + "Email it" shortcut):
//   a new-data link (works once), or an update link for one organization (works until it expires).
// Edits show each change as Now -> Change to.

import { Component, inject, OnInit, signal } from '@angular/core';
import { fieldLabel, plural } from '../shared/text';
import {
  AccessRequest,
  Change,
  LinkKind,
  NewLink,
  Option,
  Part,
  PortalApi,
  Submission,
} from '../services/portal-api';

interface LinkToSend {
  forId: string;
  link: string;
  email: string | null;
  orgName: string | null;
  expiresAt: string;
  kind: LinkKind;
}

/** Columns not worth showing in a change (derived from others). */
const HIDDEN_FIELDS = new Set(['CoordinateLocation']);

@Component({
  selector: 'portal-admin-dashboard',
  templateUrl: './admin-dashboard.html',
})
export class AdminDashboard implements OnInit {
  private readonly api = inject(PortalApi);

  protected readonly requests = signal<AccessRequest[] | null>(null);
  protected readonly submissions = signal<Submission[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busyId = signal('');
  protected readonly links = signal<LinkToSend[]>([]);
  protected readonly organizations = signal<Option[]>([]);
  protected readonly newLinkOrgId = signal('');
  /** For each request: '' = new-data link, or the organization ID for an update link. */
  private readonly choices = signal<Record<string, string>>({});

  ngOnInit() {
    this.refresh();
    this.loadOrganizations();
  }

  private async loadOrganizations() {
    const result = await this.api.formOptions();
    if (result.ok) this.organizations.set(result.options.organizations);
  }

  /** Default for an update request: the organization whose name matches what they typed. */
  protected linkChoice(r: AccessRequest): string {
    const chosen = this.choices()[r.id];
    if (chosen !== undefined) return chosen;
    if (r.kind !== 'edit') return '';
    const match = this.organizations().find(
      (o) => o.name.trim().toLowerCase() === r.org_name.trim().toLowerCase(),
    );
    return match ? String(match.id) : '';
  }

  protected choose(r: AccessRequest, value: string) {
    this.choices.update((all) => ({ ...all, [r.id]: value }));
  }

  protected async refresh() {
    this.error.set('');
    this.loading.set(true);
    const [reqs, subs] = await Promise.all([
      this.api.listAccessRequests(),
      this.api.listSubmissions(),
    ]);
    this.loading.set(false);
    if (reqs.ok) this.requests.set(reqs.requests);
    else this.error.set(reqs.message);
    if (subs.ok) this.submissions.set(subs.submissions);
    else this.error.set(subs.message);
  }

  /** Runs one dashboard action, then reloads both lists. */
  private async act<T>(
    id: string,
    run: () => Promise<({ ok: true } & T) | { ok: false; message: string }>,
    done: (r: T) => void,
  ) {
    this.busyId.set(id);
    this.error.set('');
    this.notice.set('');
    const result = await run();
    this.busyId.set('');
    await this.refresh();
    // Set after the reload, which clears old errors, so a failed action's message stays on screen.
    if (!result.ok) this.error.set(result.message);
    else done(result);
  }

  private keepLink(forId: string, r: Partial<NewLink>) {
    if (!r.link) return;
    this.links.update((all) => [
      {
        forId,
        link: r.link!,
        email: r.email ?? null,
        orgName: r.orgName ?? null,
        expiresAt: r.expiresAt ?? '',
        kind: r.kind ?? 'new',
      },
      ...all,
    ]);
  }

  protected approveRequest(r: AccessRequest) {
    const choice = this.linkChoice(r);
    if (r.kind === 'edit' && !choice) {
      this.error.set(
        `${r.org_name} wants to update existing data. Pick "Update link for: …" with their organization first.`,
      );
      return;
    }
    this.act(
      r.id,
      () => this.api.approveRequest(r.id, choice ? Number(choice) : null),
      (res: NewLink) => {
        this.keepLink(r.id, res);
        this.notice.set(`Approved ${r.org_name}. Email them the link below.`);
      },
    );
  }

  protected createEditLink(orgId: string) {
    if (!orgId) return;
    this.act(
      'create-link',
      () => this.api.createEditLink(Number(orgId)),
      (res: NewLink) => {
        this.keepLink('create-link', res);
        this.newLinkOrgId.set('');
        this.notice.set(`Update link created for ${res.orgName}. Email it to them.`);
      },
    );
  }

  protected rejectRequest(r: AccessRequest) {
    if (!confirm(`Reject the request from ${r.org_name}?`)) return;
    this.act(
      r.id,
      () => this.api.rejectRequest(r.id),
      () => this.notice.set(`Rejected ${r.org_name}.`),
    );
  }

  protected approveSubmission(s: Submission) {
    this.act(
      s.id,
      () => this.api.approveSubmission(s.id),
      (res: { saved: number }) =>
        this.notice.set(
          s.kind === 'edit'
            ? `Applied ${plural(res.saved, 'change')} from ${s.org_name ?? 'the organization'}.`
            : `Saved ${plural(res.saved, 'row')} from ${s.org_name ?? 'the submission'}.`,
        ),
    );
  }

  protected rejectSubmission(s: Submission, newLink: boolean) {
    const what = newLink ? 'Reject and create a new link' : 'Reject';
    if (!confirm(`${what} for ${s.org_name ?? 'this submission'}?`)) return;
    this.act(
      s.id,
      () => this.api.rejectSubmission(s.id, newLink),
      (res: Partial<NewLink>) => {
        this.keepLink(s.id, res);
        this.notice.set(newLink ? 'Rejected. Email them the new link below.' : 'Rejected.');
      },
    );
  }

  protected copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => this.notice.set('Link copied.'),
      () => this.notice.set('Copy failed. Select the link and copy it by hand.'),
    );
  }

  protected mailto(l: LinkToSend) {
    const expires = new Date(l.expiresAt).toLocaleString();
    const subject = encodeURIComponent(
      l.kind === 'edit' ? 'Your link to update your data' : 'Your data submission link',
    );
    const body = encodeURIComponent(
      l.kind === 'edit'
        ? `Hello${l.orgName ? ' ' + l.orgName : ''},\n\nHere is your link to update your stations, contacts, devices and sensors:\n${l.link}\n\n` +
            `You can send as many changes as you need until ${expires}. Each change is reviewed before it's saved.\n`
        : `Hello${l.orgName ? ' ' + l.orgName : ''},\n\nHere is your one-time link to submit data:\n${l.link}\n\n` +
            `It works for one submission and expires ${expires}.\n`,
    );
    return `mailto:${l.email ?? ''}?subject=${subject}&body=${body}`;
  }

  protected dismiss(l: LinkToSend) {
    this.links.update((all) => all.filter((x) => x !== l));
  }

  // ---- Preview helpers ----

  protected columns(part: Part): string[] {
    const keys = new Set<string>();
    for (const row of part.rows) for (const k of Object.keys(row)) if (k !== '_id') keys.add(k);
    return [...keys];
  }

  protected readonly fieldLabel = fieldLabel;
  protected readonly plural = plural;

  protected changedFields(c: Change): string[] {
    return Object.keys(c.after ?? {}).filter((f) => !HIDDEN_FIELDS.has(f));
  }

  /** A value in the When sent / Change to columns. */
  protected diffCell(value: unknown): string {
    if (value === null || value === undefined || value === '') return '(empty)';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    return this.cell(value);
  }

  protected cell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && '$ref' in (value as object)) return '→ new row';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  protected when(iso: string) {
    return new Date(iso).toLocaleString();
  }
}
