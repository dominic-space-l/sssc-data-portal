// Form builders: turn what someone typed into a form into the database rows to save.
//
// One builder per form (organization, project, station, device). Each one:
//   1. checks the fields (required, numbers, dates, ranges),
//   2. looks up anything it needs (does this organization exist? is this contact already saved?),
//   3. returns the rows as "parts" (see rows.ts), using placeholders for brand-new rows.
//
// The same parts are then either saved straight away (admin) or held for approval (outside organization).
// Based on the save logic in the original Express forms.

import { Part, RowError } from "./rows.ts";

// deno-lint-ignore no-explicit-any
type Sql = any;
export type Fields = Record<string, unknown>;

export const FORMS = ["organization", "project", "station", "device"] as const;
export type FormName = typeof FORMS[number];

/** A problem with one field. The website can show the message next to that field. */
export class FieldError extends RowError {
  constructor(public field: string, message: string) {
    super(message);
  }
}

// Station roles, as in StationRoles. Station contacts are saved with the primary owner role.
export const STATION_ROLES = { primary: 1, secondary: 2, maintainer: 3, dataProvider: 4 } as const;
const CONTACT_ROLE_ID = STATION_ROLES.primary;

// ---------------------------------------------------------------------------
// Field readers: each returns a clean value or throws a FieldError
// ---------------------------------------------------------------------------

export function text(f: Fields, key: string, label: string, opts: { required?: boolean; max?: number } = {}) {
  const raw = f[key];
  const value = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!value) {
    if (opts.required) throw new FieldError(key, `${label} is required.`);
    return null;
  }
  if (value.length > (opts.max ?? 2000)) throw new FieldError(key, `${label} is too long.`);
  return value;
}

export function number(f: Fields, key: string, label: string, opts: { required?: boolean; whole?: boolean; min?: number; max?: number } = {}) {
  const raw = f[key];
  if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) {
    if (opts.required) throw new FieldError(key, `${label} is required.`);
    return null;
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) throw new FieldError(key, `${label} must be a number.`);
  if (opts.whole && !Number.isInteger(n)) throw new FieldError(key, `${label} must be a whole number.`);
  if (opts.min !== undefined && n < opts.min) throw new FieldError(key, `${label} must be at least ${opts.min}.`);
  if (opts.max !== undefined && n > opts.max) throw new FieldError(key, `${label} must be at most ${opts.max}.`);
  return n;
}

export const id = (f: Fields, key: string, label: string, required = false) =>
  number(f, key, label, { required, whole: true, min: 1 });

export function bool(f: Fields, key: string) {
  const raw = f[key];
  return raw === true || raw === "true" || raw === "yes" || raw === "on";
}

export function date(f: Fields, key: string, label: string) {
  const value = text(f, key, label);
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new FieldError(key, `${label} must be a date (YYYY-MM-DD).`);
  }
  return value;
}

export function email(f: Fields, key: string, label: string) {
  const value = text(f, key, label, { required: true, max: 320 })!;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new FieldError(key, `${label} isn't a valid email address.`);
  return value;
}

/** Drops empty optional values so the table's own defaults apply. */
export function row(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined));
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function mustExist(sql: Sql, table: string, idColumn: string, value: number | null, field: string, label: string) {
  if (value === null) return;
  const [found] = await sql`select 1 from ${sql(table)} where ${sql(idColumn)} = ${value} limit 1`;
  if (!found) throw new FieldError(field, `That ${label} doesn't exist.`);
}

export const likeExact = (s: string) => s.replace(/[\\%_]/g, "\\$&");

async function organizationTypes(sql: Sql): Promise<string[]> {
  const rows = await sql`
    select e.enumlabel as label
    from information_schema.columns c
    join pg_type t on t.typname = c.udt_name
    join pg_enum e on e.enumtypid = t.oid
    where c.table_schema = 'public' and c.table_name = 'Organizations' and c.column_name = 'OrganizationType'
    order by e.enumsortorder`;
  return rows.map((r: { label: string }) => r.label);
}

/** Dropdown lists for the forms. Only IDs and names: nothing private. */
export async function formOptions(sql: Sql) {
  const [organizations, projects, stationTypes, observationTypes, sites, stations, manufacturers, orgTypes] =
    await Promise.all([
      sql`select "OrganizationID" as id, "OrganizationName" as name from "Organizations" order by 2`,
      sql`select "ProjectID" as id, "ProjectName" as name, "OrganizationID" as "organizationId" from "OrganizationProjects" order by 2`,
      sql`select "TypeID" as id, "TypeName" as name from "StationTypes" order by 2`,
      sql`select "ObservationTypeID" as id, "ObservationType" as name from "ObservationTypes" order by 2`,
      sql`select "SiteID" as id, "SiteName" as name from "StationSites" order by 2`,
      sql`select "StationID" as id, "StationName" as name from "Stations" order by 2`,
      sql`select "ManufacturerID" as id, "ManufacturerName" as name from "DeviceManufacturers" order by 2`,
      organizationTypes(sql),
    ]);
  return { organizations, projects, stationTypes, observationTypes, sites, stations, manufacturers, organizationTypes: orgTypes };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** New organization + its first contact. */
async function buildOrganization(sql: Sql, f: Fields): Promise<Part[]> {
  const name = text(f, "OrganizationName", "Organization name", { required: true, max: 200 })!;
  const type = text(f, "OrganizationType", "Organization type", { required: true })!;
  const types = await organizationTypes(sql);
  if (types.length && !types.includes(type)) throw new FieldError("OrganizationType", "Pick an organization type from the list.");

  const [existing] = await sql`select 1 from "Organizations" where "OrganizationName" ilike ${likeExact(name)} limit 1`;
  if (existing) throw new FieldError("OrganizationName", `An organization named "${name}" already exists.`);

  return [
    { table: "Organizations", rows: [{ _id: "org", ...row({
      OrganizationName: name,
      OrganizationType: type,
      OrganizationNotes: text(f, "OrganizationNotes", "Notes"),
    }) }] },
    { table: "Contacts", rows: [row({
      OrganizationID: { $ref: "org" },
      Email: email(f, "ContactEmail", "Contact email"),
      FirstName: text(f, "ContactFirstName", "Contact first name", { required: true, max: 100 }),
      LastName: text(f, "ContactLastName", "Contact last name", { required: true, max: 100 }),
      ContactNotes: text(f, "ContactNotes", "Contact notes"),
    })] },
  ] as Part[];
}

/** New project for an existing organization. */
async function buildProject(sql: Sql, f: Fields): Promise<Part[]> {
  const organizationId = id(f, "OrganizationID", "Organization", true);
  await mustExist(sql, "Organizations", "OrganizationID", organizationId, "OrganizationID", "organization");
  const start = date(f, "StartDate", "Start date");
  const end = date(f, "EndDate", "End date");
  if (start && end && end < start) throw new FieldError("EndDate", "End date can't be before the start date.");

  return [{ table: "OrganizationProjects", rows: [row({
    OrganizationID: organizationId,
    ProjectName: text(f, "ProjectName", "Project name", { required: true, max: 200 }),
    StartDate: start,
    EndDate: end,
    IsOngoing: bool(f, "IsOngoing"),
    ProjectNotes: text(f, "ProjectNotes", "Notes"),
  })] }] as Part[];
}

/** New station + its organizations, observation type and contact. */
async function buildStation(sql: Sql, f: Fields): Promise<Part[]> {
  const stationName = text(f, "StationName", "Station name", { required: true, max: 200 })!;
  const projectId = id(f, "ProjectID", "Project", true);
  const stationTypeId = id(f, "StationTypeID", "Station type", true);
  const observationTypeId = id(f, "ObservationTypeID", "Observation type", true);
  const siteId = id(f, "SiteID", "Site");
  const longitude = number(f, "Longitude", "Longitude", { required: true, min: -180, max: 180 })!;
  const latitude = number(f, "Latitude", "Latitude", { required: true, min: -90, max: 90 })!;
  const updateInterval = number(f, "UpdateIntervalMinutes", "Update interval", { whole: true, min: 0 });
  const transmitTime = number(f, "TransmitTimeMinutes", "Transmit time", { whole: true, min: 0 });

  const owners = [
    { field: "PrimaryOwnerID", label: "Primary owner", role: STATION_ROLES.primary, required: true },
    { field: "SecondaryOwnerID", label: "Secondary owner", role: STATION_ROLES.secondary, required: false },
    { field: "MaintainerID", label: "Maintainer", role: STATION_ROLES.maintainer, required: false },
    { field: "DataProviderID", label: "Data provider", role: STATION_ROLES.dataProvider, required: false },
  ].map((o) => ({ ...o, orgId: id(f, o.field, o.label, o.required) }));

  const contactEmail = email(f, "ContactEmail", "Contact email");
  const contactFirst = text(f, "ContactFirstName", "Contact first name", { required: true, max: 100 });
  const contactLast = text(f, "ContactLastName", "Contact last name", { required: true, max: 100 });

  await mustExist(sql, "OrganizationProjects", "ProjectID", projectId, "ProjectID", "project");
  await mustExist(sql, "StationTypes", "TypeID", stationTypeId, "StationTypeID", "station type");
  await mustExist(sql, "ObservationTypes", "ObservationTypeID", observationTypeId, "ObservationTypeID", "observation type");
  await mustExist(sql, "StationSites", "SiteID", siteId, "SiteID", "site");
  for (const o of owners) await mustExist(sql, "Organizations", "OrganizationID", o.orgId, o.field, "organization");

  // Reuse the contact if this email is already saved (ignoring case).
  const [existingContact] = await sql`
    select "ContactID" from "Contacts" where "Email" ilike ${likeExact(contactEmail)} limit 1`;

  const parts: Part[] = [
    { table: "Stations", rows: [{ _id: "station", ...row({
      ProjectID: projectId,
      SiteID: siteId,
      StationTypeID: stationTypeId,
      StationName: stationName,
      StationCode: text(f, "StationCode", "Station code", { max: 100 }),
      InstallDate: date(f, "InstallDate", "Install date"),
      WebLink: text(f, "WebLink", "Web link", { max: 500 }),
      MesoWestLink: text(f, "MesoWestLink", "MesoWest link", { max: 500 }),
      IsActive: bool(f, "IsActive"),
      IsRealTime: bool(f, "IsRealTime"),
      IsSeasonal: bool(f, "IsSeasonal"),
      UpdateInterval: updateInterval === null ? null : `${updateInterval} minutes`,
      TransmitTime: transmitTime === null ? null : `${transmitTime} minutes`,
      CoordinateLocation: `SRID=4326;POINT(${longitude} ${latitude})`,
      Longitude: longitude,
      Latitude: latitude,
      "Elevation (FT)": number(f, "ElevationFt", "Elevation", { whole: true }),
      StationNotes: text(f, "StationNotes", "Station notes"),
    }) }] } as Part,
    { table: "StationOrganizationRole", rows: owners
        .filter((o) => o.orgId !== null)
        .map((o) => ({ OrganizationID: o.orgId, StationID: { $ref: "station" }, RoleID: o.role })) } as Part,
    { table: "StationObservations", rows: [{ StationID: { $ref: "station" }, ObservationTypeID: observationTypeId }] } as Part,
  ];

  if (!existingContact) {
    parts.push({ table: "Contacts", rows: [{ _id: "contact", ...row({
      OrganizationID: owners[0].orgId,
      Email: contactEmail,
      FirstName: contactFirst,
      LastName: contactLast,
      ContactNotes: text(f, "ContactNotes", "Contact notes"),
    }) }] } as Part);
  }
  parts.push({ table: "StationContact", rows: [{
    StationID: { $ref: "station" },
    ContactID: existingContact ? existingContact.ContactID : { $ref: "contact" },
    RoleID: CONTACT_ROLE_ID,
  }] } as Part);

  return parts;
}

/** Device model (and manufacturer, if new), optionally linked to a station. */
async function buildDevice(sql: Sql, f: Fields): Promise<Part[]> {
  const manufacturerName = text(f, "ManufacturerName", "Manufacturer", { required: true, max: 200 })!;
  const modelNumber = text(f, "ModelNumber", "Model number", { required: true, max: 200 })!;
  const modelName = text(f, "ModelName", "Model name", { required: true, max: 200 })!;
  const stationId = id(f, "StationID", "Station");
  const serialNumber = text(f, "SerialNumber", "Serial number", { max: 200 });
  if (serialNumber && stationId === null) {
    throw new FieldError("SerialNumber", "A serial number can only be saved when a station is picked.");
  }
  await mustExist(sql, "Stations", "StationID", stationId, "StationID", "station");

  const parts: Part[] = [];
  const [manufacturer] = await sql`
    select "ManufacturerID" from "DeviceManufacturers" where "ManufacturerName" ilike ${likeExact(manufacturerName)} limit 1`;
  let manufacturerRef: unknown = manufacturer?.ManufacturerID;
  if (!manufacturer) {
    parts.push({ table: "DeviceManufacturers", rows: [{ _id: "manufacturer", ...row({
      ManufacturerName: manufacturerName,
      ManufacturerNotes: text(f, "ManufacturerNotes", "Manufacturer notes"),
    }) }] } as Part);
    manufacturerRef = { $ref: "manufacturer" };
  }

  const [spec] = manufacturer ? await sql`
    select "DeviceSpecificationID" from "DeviceSpecifications"
    where "ManufacturerID" = ${manufacturer.ManufacturerID} and "ModelNumber" ilike ${likeExact(modelNumber)} limit 1` : [];
  let specRef: unknown = spec?.DeviceSpecificationID;
  if (!spec) {
    parts.push({ table: "DeviceSpecifications", rows: [{ _id: "spec", ...row({
      ManufacturerID: manufacturerRef,
      ModelNumber: modelNumber,
      ModelName: modelName,
      ModelNotes: text(f, "ModelNotes", "Model notes"),
    }) }] } as Part);
    specRef = { $ref: "spec" };
  }

  if (stationId !== null) {
    parts.push({ table: "StationsToSpecs", rows: [row({
      StationID: stationId,
      DeviceSpecificationID: specRef,
      SerialNumber: serialNumber,
    })] } as Part);
  }

  if (parts.length === 0) {
    throw new FieldError("ModelNumber", "This device is already saved. Pick a station to link it to one.");
  }
  return parts;
}

const BUILDERS: Record<FormName, (sql: Sql, f: Fields) => Promise<Part[]>> = {
  organization: buildOrganization,
  project: buildProject,
  station: buildStation,
  device: buildDevice,
};

/** Forms outside organizations may use (ALLOWED_FORMS secret, comma-separated; default: all). */
export function allowedForms(): FormName[] {
  const raw = Deno.env.get("ALLOWED_FORMS");
  if (!raw) return [...FORMS];
  return raw.split(",").map((s) => s.trim()).filter((s): s is FormName => (FORMS as readonly string[]).includes(s));
}

export function isForm(name: unknown): name is FormName {
  return typeof name === "string" && (FORMS as readonly string[]).includes(name);
}

/** Runs the right builder. Returns the parts to save. */
export async function buildForm(sql: Sql, form: unknown, fields: unknown): Promise<Part[]> {
  if (!isForm(form)) throw new RowError("Unknown form.");
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new RowError("Missing form fields.");
  return await BUILDERS[form](sql, fields as Fields);
}
