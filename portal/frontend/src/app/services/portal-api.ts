// PortalApi: every behind-the-scenes action the website's pages use.
// Pages never talk to the database directly; they call these methods, which call
// Supabase Auth (logins) or the Edge Functions (request-access, submit-external, admin-api).
//
// Every method returns { ok: true, ... } or { ok: false, message } (plus `field` for a form field error).

import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SETTINGS } from '../settings';

export type Result<T = object> =
  ({ ok: true } & T) | { ok: false; message: string; field?: string; linkState?: string };

export interface PortalUser {
  id: string;
  email: string;
}
export interface Option {
  id: number;
  name: string;
}
export interface FormOptions {
  organizations: Option[];
  projects: (Option & { organizationId: number })[];
  stationTypes: Option[];
  observationTypes: Option[];
  sites: Option[];
  stations: Option[];
  manufacturers: Option[];
  sensors: Option[];
  measurementUnits: (Option & { symbol: string | null })[];
  organizationTypes: string[];
}
/** main = the single combined form ("Enter Information"); the other four are admin-only. */
export type FormName = 'main' | 'organization' | 'project' | 'station' | 'device';
export type Fields = Record<string, string | number | boolean | null>;

/** new: add new data (works once). edit: update the organization's existing data (works until it expires). */
export type LinkKind = 'new' | 'edit';

export interface AccessRequest {
  id: string;
  org_name: string;
  contact_name: string | null;
  email: string;
  reason: string | null;
  created_at: string;
  kind: LinkKind;
}
export interface Part {
  table: string;
  rows: Record<string, unknown>[];
}
/** One change in an edit, with the values before and after. */
export interface Change {
  op: 'update' | 'delete' | 'insert';
  table: string;
  label: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  row?: Record<string, unknown>;
}
export interface Submission {
  id: string;
  form: string | null;
  parts: Part[];
  row_count: number;
  submitted_at: string;
  kind: LinkKind;
  changes: Change[] | null;
  org_name: string | null;
  contact_name: string | null;
  email: string | null;
}
export interface NewLink {
  link: string;
  expiresAt: string;
  email: string | null;
  orgName: string | null;
  kind?: LinkKind;
}

/** What an organization can update through an update link. */
export interface MyRecords {
  organization: { id: number; name: string };
  stations: { id: number; name: string; code: string | null; roles: string[] }[];
  contacts: {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    notes: string | null;
  }[];
}
export interface StationDetails {
  station: Fields;
  contacts: { id: number; email: string; firstName: string | null; lastName: string | null }[];
  devices: {
    deviceSpecificationId: number;
    manufacturer: string | null;
    modelNumber: string | null;
    modelName: string | null;
    serialNumber: string | null;
  }[];
  sensors: {
    sensorId: number;
    sensorName: string;
    count: number | null;
    placementHeightMeters: number | null;
    placementNotes: string | null;
  }[];
}
export type EditKind = 'station' | 'station_contact' | 'contact' | 'device' | 'sensor';
/** An app (e.g. Claude) asking to connect to the portal's data. */
export interface ConsentRequest {
  clientName: string;
  clientUri: string;
  email: string;
  scope: string;
}

@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly db: SupabaseClient = createClient(
    SETTINGS.supabaseUrl,
    SETTINGS.supabasePublishableKey,
  );

  /** Whoever is logged in (admin or not), or null. Pages can read this to show or hide things. */
  readonly user = signal<PortalUser | null>(null);

  /**
   * Whether the logged-in user is in the admins table: null until checked. Only used to show the
   * right menu and pages; the server checks again on every admin action.
   */
  readonly isAdmin = signal<boolean | null>(null);
  private adminCheckedFor = '';

  constructor() {
    this.db.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null;
      if (user?.id !== this.user()?.id) this.forgetAdmin();
      this.user.set(user);
      // Deferred: calling Supabase inside this callback can deadlock (see supabase-js docs).
      if (user) setTimeout(() => void this.checkAdmin(), 0);
    });
  }

  private forgetAdmin() {
    this.adminCheckedFor = '';
    this.isAdmin.set(null);
  }

  /**
   * Asks the server whether the logged-in user is an admin (admins are only managed in Supabase).
   * Uses list_requests, the cheapest admin-only call: it answers 401 for anyone not in the admins
   * table. Any other failure (e.g. offline) isn't treated as "not an admin".
   */
  async checkAdmin(): Promise<boolean> {
    const user = this.user() ?? (await this.getUser());
    if (!user) {
      this.forgetAdmin();
      return false;
    }
    if (this.adminCheckedFor === user.id && this.isAdmin() !== null) return this.isAdmin()!;
    const { error } = await this.db.functions.invoke('admin-api', {
      body: { action: 'list_requests' },
    });
    const status = (error as { context?: Response } | null)?.context?.status;
    const admin = !error || status !== 401;
    this.adminCheckedFor = user.id;
    this.isAdmin.set(admin);
    return admin;
  }

  /** Calls an Edge Function and always returns { ok, ... } with a readable message on errors. */
  private async call<T>(name: string, body: object): Promise<Result<T>> {
    const { data, error } = await this.db.functions.invoke(name, { body });
    if (!error) return data as Result<T>;
    try {
      const detail = await (error as { context?: Response }).context?.json();
      if (detail?.message) return { ok: false, ...detail };
    } catch {
      // fall through to the generic message
    }
    return { ok: false, message: error.message };
  }

  // ---------------- Logins ----------------

  async login(email: string, password: string): Promise<Result<{ user: PortalUser }>> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    const user = { id: data.user.id, email: data.user.email ?? '' };
    if (user.id !== this.user()?.id) this.forgetAdmin();
    this.user.set(user);
    return { ok: true, user };
  }

  async logout(): Promise<Result> {
    const { error } = await this.db.auth.signOut();
    if (error) return { ok: false, message: error.message };
    this.user.set(null);
    this.forgetAdmin();
    return { ok: true };
  }

  /** Checks with Supabase (not just the browser) who is logged in. */
  async getUser(): Promise<PortalUser | null> {
    const { data, error } = await this.db.auth.getUser();
    const user = error || !data.user ? null : { id: data.user.id, email: data.user.email ?? '' };
    if (user?.id !== this.user()?.id) this.forgetAdmin();
    this.user.set(user);
    return user;
  }

  // ---------------- Outside organizations ----------------

  requestAccess(form: {
    orgName: string;
    contactName: string;
    email: string;
    reason: string;
    turnstileToken: string;
    kind: LinkKind;
  }) {
    return this.call('request-access', form);
  }

  /** Is this link still usable? Also says its kind and which forms it may use. */
  checkLink(code: string) {
    return this.call<{
      kind: LinkKind;
      orgName: string | null;
      expiresAt: string;
      forms: FormName[];
    }>('submit-external', { action: 'check', code });
  }

  // ---------------- Update links (an organization edits its existing data) ----------------

  myRecords(code: string) {
    return this.call<MyRecords>('submit-external', { action: 'my_records', code });
  }

  stationDetails(code: string, stationId: number) {
    return this.call<StationDetails>('submit-external', {
      action: 'station_details',
      code,
      stationId,
    });
  }

  /** Sends one edit for review. `target` says which record (e.g. { stationId }). */
  submitEdit(code: string, edit: EditKind, target: Record<string, unknown>, fields: Fields) {
    return this.call<{ changes: number }>('submit-external', {
      action: 'submit_edit',
      code,
      edit,
      target,
      fields,
    });
  }

  // ---------------- Forms (both admin and link) ----------------

  /** Dropdown lists for the forms. With a link code for outside organizations, without for the admin. */
  formOptions(code?: string) {
    return code
      ? this.call<{ options: FormOptions }>('submit-external', { action: 'form_options', code })
      : this.call<{ options: FormOptions }>('admin-api', { action: 'form_options' });
  }

  /**
   * Submits a form. With a link code: held as pending for the admin to approve.
   * Without (admin logged in): saved straight away.
   */
  submitForm(form: FormName, fields: Fields, code?: string) {
    return code
      ? this.call<{ rows: number }>('submit-external', {
          action: 'submit_form',
          code,
          form,
          fields,
        })
      : this.call<{ saved: number }>('admin-api', { action: 'submit_form', form, fields });
  }

  // ---------------- Admin dashboard ----------------

  listAccessRequests() {
    return this.call<{ requests: AccessRequest[] }>('admin-api', { action: 'list_requests' });
  }
  /** With organizationId: an update link for that organization. Without: a one-use new-data link. */
  approveRequest(id: string, organizationId?: number | null) {
    return this.call<NewLink>('admin-api', {
      action: 'approve_request',
      id,
      organizationId: organizationId ?? null,
    });
  }
  /** An update link for an organization, without a request. */
  createEditLink(organizationId: number) {
    return this.call<NewLink>('admin-api', { action: 'create_edit_link', organizationId });
  }
  rejectRequest(id: string) {
    return this.call<{ email: string; orgName: string }>('admin-api', {
      action: 'reject_request',
      id,
    });
  }
  listSubmissions() {
    return this.call<{ submissions: Submission[] }>('admin-api', { action: 'list_submissions' });
  }
  approveSubmission(id: string) {
    return this.call<{ saved: number }>('admin-api', { action: 'approve_submission', id });
  }
  /** newLink: true also creates a fresh one-time link to send them. */
  rejectSubmission(id: string, newLink = false) {
    return this.call<Partial<NewLink>>('admin-api', { action: 'reject_submission', id, newLink });
  }

  // ---------------- Connecting an AI app (OAuth consent for the MCP server) ----------------

  /**
   * Looks up an app's request to connect. If the admin already allowed this app before,
   * Supabase skips the question and gives back `redirectUrl` straight away.
   */
  async oauthRequest(
    authorizationId: string,
  ): Promise<Result<{ request?: ConsentRequest; redirectUrl?: string }>> {
    const { data, error } = await this.db.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !data)
      return { ok: false, message: error?.message ?? 'Request not found or expired.' };
    if (!('authorization_id' in data)) return { ok: true, redirectUrl: data.redirect_url };
    return {
      ok: true,
      request: {
        clientName: data.client.name,
        clientUri: data.client.uri,
        email: data.user.email,
        scope: data.scope,
      },
    };
  }

  /** Allow or deny. Returns where to send the browser next (back to the app). */
  async oauthDecide(
    authorizationId: string,
    allow: boolean,
  ): Promise<Result<{ redirectUrl: string }>> {
    const options = { skipBrowserRedirect: true };
    const { data, error } = allow
      ? await this.db.auth.oauth.approveAuthorization(authorizationId, options)
      : await this.db.auth.oauth.denyAuthorization(authorizationId, options);
    if (error || !data)
      return {
        ok: false,
        message: error?.message ?? 'Something went wrong. Try connecting again.',
      };
    return { ok: true, redirectUrl: data.redirect_url };
  }
}
