// Form builders: turn what someone typed into a form into the database rows to save.
//
// One builder per form. "main" is the single combined form (Elias's "Enter Information" form, used by
// admins and outside organizations); organization, project, station and device are the separate
// admin-only forms. Each builder:
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

export const FORMS = ["main", "organization", "project", "station", "device"] as const;
export type FormName = typeof FORMS[number];

/** Forms the admin can use. */
export const ADMIN_FORMS: readonly FormName[] = FORMS;

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

/** Dropdown lists for the forms. Only IDs and names: no coordinates, contacts or notes. */
export async function formOptions(sql: Sql) {
  const [organizations, projects, stationTypes, observationTypes, sites, stations, manufacturers, sensors, measurementUnits, orgTypes] =
    await Promise.all([
      sql`select "OrganizationID" as id, "OrganizationName" as name from "Organizations" order by 2`,
      sql`select "ProjectID" as id, "ProjectName" as name, "OrganizationID" as "organizationId" from "OrganizationProjects" order by 2`,
      sql`select "TypeID" as id, "TypeName" as name from "StationTypes" order by 2`,
      sql`select "ObservationTypeID" as id, "ObservationType" as name from "ObservationTypes" order by 2`,
      sql`select "SiteID" as id, "SiteName" as name from "StationSites" order by 2`,
      sql`select "StationID" as id, "StationName" as name from "Stations" order by 2`,
      sql`select "ManufacturerID" as id, "ManufacturerName" as name from "DeviceManufacturers" order by 2`,
      sql`select "SensorID" as id, "SensorName" as name from "Sensors" order by 2`,
      sql`select "MeasurementUnitsID" as id, coalesce(nullif("UnitName", ''), "UnitSymbol") as name, "UnitSymbol" as symbol
          from "MeasurementUnits" order by 2`,
      organizationTypes(sql),
    ]);
  return {
    organizations, projects, stationTypes, observationTypes, sites, stations, manufacturers, sensors, measurementUnits,
    organizationTypes: orgTypes,
  };
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
  const projectName = text(f, "ProjectName", "Project name", { required: true, max: 200 })!;
  const [taken] = await sql`select 1 from "OrganizationProjects" where "ProjectName" ilike ${likeExact(projectName)} limit 1`;
  if (taken) throw new FieldError("ProjectName", `A project named "${projectName}" already exists.`);

  return [{ table: "OrganizationProjects", rows: [row({
    OrganizationID: organizationId,
    ProjectName: projectName,
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
      Longitude: longitude, // CoordinateLocation is generated from these by the database
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
    if (spec) {
      const [linked] = await sql`
        select 1 from "StationsToSpecs"
        where "StationID" = ${stationId} and "DeviceSpecificationID" = ${spec.DeviceSpecificationID}`;
      if (linked) throw new FieldError("StationID", "This device model is already linked to that station.");
    }
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

// ---------------------------------------------------------------------------
// The single combined form ("Enter Information")
// ---------------------------------------------------------------------------
//
// Ported from the /main route of Elias's Express app (Elias-new-branch, server/app.js), which
// is the source of truth for what this form saves and how. Differences, all because of the
// production schema or to save all-or-nothing:
//   - everything is saved in one transaction (admin) or held for approval (link), instead of
//     saving step by step and deleting new rows if a later step fails
//   - names that are unique in the database (project, sensor, organization, station type,
//     manufacturer) are matched ignoring case, and a clash is reported on its field
//   - CoordinateLocation is generated by the database from Longitude/Latitude, so it isn't sent
//   - a station keeps at most one contact (StationContact's key is StationID)
//   - the observation type comes from the ObservationTypes table instead of a fixed 1-10 list

/** Looks up one row by a text column, ignoring case. Returns its id or null. */
async function findByName(sql: Sql, table: string, idColumn: string, nameColumn: string, name: string, extra?: [string, unknown]) {
  const rows = extra
    ? await sql`select ${sql(idColumn)} as id from ${sql(table)}
                where ${sql(nameColumn)} ilike ${likeExact(name)} and ${sql(extra[0])} = ${extra[1] as never} limit 1`
    : await sql`select ${sql(idColumn)} as id from ${sql(table)} where ${sql(nameColumn)} ilike ${likeExact(name)} limit 1`;
  return rows[0] ? Number(rows[0].id) : null;
}

type Ref = number | { $ref: string };

async function buildMain(sql: Sql, f: Fields): Promise<Part[]> {
  // ----- Read and check the fields (Elias's "Required information" first) -----
  const contactEmail = email(f, "ContactEmail", "Contact email");
  const contactFirst = text(f, "ContactFirstName", "Contact first name", { required: true, max: 100 })!;
  const contactLast = text(f, "ContactLastName", "Contact last name", { required: true, max: 100 })!;
  const orgName = text(f, "OrganizationName", "Organization name", { required: true, max: 200 })!;
  const orgType = text(f, "OrganizationType", "Organization type", { required: true })!;
  const projectName = text(f, "ProjectName", "Project name", { required: true, max: 200 })!;
  const stationName = text(f, "StationName", "Station name", { required: true, max: 200 })!;
  const observationTypeId = id(f, "ObservationTypeID", "Observation type", true)!;
  const stationTypeName = text(f, "StationTypeName", "Station type", { required: true, max: 200 })!;
  const longitude = number(f, "Longitude", "Longitude", { required: true, min: -180, max: 180 })!;
  const latitude = number(f, "Latitude", "Latitude", { required: true, min: -90, max: 90 })!;
  const sensorName = text(f, "SensorName", "Sensor name", { required: true, max: 200 })!;
  const sensorObservation = text(f, "SensorObservation", "Sensor observation", { required: true, max: 500 })!;

  const start = date(f, "StartDate", "Begin date");
  const end = date(f, "EndDate", "End date");
  if (start && end && end < start) throw new FieldError("EndDate", "The project end date is before its begin date.");
  const installDate = date(f, "InstallDate", "Install date");
  const updateInterval = number(f, "UpdateIntervalMinutes", "Update interval", { whole: true, min: 0 });
  const transmitTime = number(f, "TransmitTimeMinutes", "Transmit time", { whole: true, min: 0 });
  const elevationFt = number(f, "ElevationFt", "Relative elevation", { whole: true });

  // Site: a name is needed for any site details, and a named site needs coordinates.
  const siteName = text(f, "SiteName", "Site name", { max: 200 });
  const siteLatitude = number(f, "SiteLatitude", "Site latitude", { min: -90, max: 90 });
  const siteLongitude = number(f, "SiteLongitude", "Site longitude", { min: -180, max: 180 });
  const siteElevation = number(f, "SiteElevationFt", "Site elevation", { whole: true });
  const siteNotes = text(f, "SiteNotes", "Site notes");
  if (!siteName && [siteLatitude, siteLongitude, siteElevation, siteNotes].some((v) => v !== null)) {
    throw new FieldError("SiteName", "Enter a site name for the site details you filled in.");
  }

  // Measurement unit (optional): by name if given, otherwise by symbol.
  const unitName = text(f, "UnitName", "Measurement unit", { max: 100 });
  const unitSymbol = text(f, "UnitSymbol", "Measurement unit symbol", { max: 20 });

  // Device (optional): any device field needs a manufacturer, and model details need a model.
  const manufacturerName = text(f, "ManufacturerName", "Manufacturer name", { max: 200 });
  const manufacturerNotes = text(f, "ManufacturerNotes", "Manufacturer notes");
  const modelNumber = text(f, "ModelNumber", "Device model number", { max: 200 });
  const modelName = text(f, "ModelName", "Device model name", { max: 200 });
  const modelNotes = text(f, "ModelNotes", "Device model notes");
  const serialNumber = text(f, "SerialNumber", "Serial number", { max: 200 });
  const hasModel = modelNumber !== null || modelName !== null;
  if (!manufacturerName && [modelNumber, modelName, manufacturerNotes, modelNotes, serialNumber].some((v) => v !== null)) {
    throw new FieldError("ManufacturerName", "Manufacturer name is required when any device field is filled in.");
  }
  if ((serialNumber || modelNotes) && !hasModel) {
    throw new FieldError("ModelNumber", "Enter a device model number or model name to go with the serial number or model notes.");
  }

  // ----- Checks that only read (nothing is saved yet) -----
  const types = await organizationTypes(sql);
  if (types.length && !types.includes(orgType)) throw new FieldError("OrganizationType", "Pick an organization type from the list.");
  await mustExist(sql, "ObservationTypes", "ObservationTypeID", observationTypeId, "ObservationTypeID", "observation type");

  // Secondary owner, maintainer and data provider must already exist, unless they're the
  // organization entered at the top of the form.
  const otherRoles = [
    { field: "SecondaryOwnerName", label: "Secondary owner", role: STATION_ROLES.secondary },
    { field: "MaintainerName", label: "Maintainer", role: STATION_ROLES.maintainer },
    { field: "DataProviderName", label: "Data provider", role: STATION_ROLES.dataProvider },
  ].map((r) => ({ ...r, name: text(f, r.field, r.label, { max: 200 }) })).filter((r) => r.name);

  const orgId = await findByName(sql, "Organizations", "OrganizationID", "OrganizationName", orgName);
  const roleOrgs: { role: number; org: Ref }[] = [];
  for (const r of otherRoles) {
    if (r.name!.toLowerCase() === orgName.toLowerCase()) continue; // resolved below, once org is known
    const found = await findByName(sql, "Organizations", "OrganizationID", "OrganizationName", r.name!);
    if (found === null) throw new FieldError(r.field, `Organization not found: ${r.name}. It must already exist.`);
    roleOrgs.push({ role: r.role, org: found });
  }

  const parts: Part[] = [];
  const add = (table: string, row: Record<string, unknown>) => {
    const last = parts[parts.length - 1];
    if (last && last.table === table) last.rows.push(row as never);
    else parts.push({ table, rows: [row] } as Part);
  };

  // ----- Organization (owns the project, primary owner of the station) -----
  let org: Ref;
  if (orgId !== null) org = orgId;
  else {
    add("Organizations", { _id: "org", ...row({ OrganizationName: orgName, OrganizationType: orgType, OrganizationNotes: text(f, "OrganizationNotes", "Organization notes") }) });
    org = { $ref: "org" };
  }
  for (const r of otherRoles) {
    if (r.name!.toLowerCase() === orgName.toLowerCase()) roleOrgs.push({ role: r.role, org });
  }

  // ----- Contact (reused by email) -----
  const contactId = await findByName(sql, "Contacts", "ContactID", "Email", contactEmail);
  let contact: Ref;
  if (contactId !== null) contact = contactId;
  else {
    add("Contacts", { _id: "contact", ...row({ OrganizationID: org, Email: contactEmail, FirstName: contactFirst, LastName: contactLast, ContactNotes: text(f, "ContactNotes", "Contact notes") }) });
    contact = { $ref: "contact" };
  }

  // ----- Project (names are unique across all organizations) -----
  const [projectRow] = await sql`
    select "ProjectID" as id, "OrganizationID" as org from "OrganizationProjects" where "ProjectName" ilike ${likeExact(projectName)} limit 1`;
  let project: Ref;
  if (projectRow) {
    if (orgId === null || Number(projectRow.org) !== orgId) {
      throw new FieldError("ProjectName", `A project named "${projectName}" already belongs to another organization.`);
    }
    project = Number(projectRow.id);
  } else {
    add("OrganizationProjects", { _id: "project", ...row({ ProjectName: projectName, OrganizationID: org, StartDate: start, EndDate: end, IsOngoing: bool(f, "IsOngoing"), ProjectNotes: text(f, "ProjectNotes", "Project notes") }) });
    project = { $ref: "project" };
  }

  // ----- Station type (created if new) -----
  const stationTypeId = await findByName(sql, "StationTypes", "TypeID", "TypeName", stationTypeName);
  let stationType: Ref;
  if (stationTypeId !== null) stationType = stationTypeId;
  else {
    add("StationTypes", { _id: "stationType", ...row({ TypeName: stationTypeName, TypeNotes: text(f, "StationTypeNotes", "Station type notes") }) });
    stationType = { $ref: "stationType" };
  }

  // ----- Site (optional, created if new) -----
  let site: Ref | null = null;
  if (siteName) {
    const siteId = await findByName(sql, "StationSites", "SiteID", "SiteName", siteName);
    if (siteId !== null) site = siteId;
    else {
      if (siteLatitude === null) throw new FieldError("SiteLatitude", "Site latitude is required for a new site.");
      if (siteLongitude === null) throw new FieldError("SiteLongitude", "Site longitude is required for a new site.");
      const [sameSpot] = await sql`
        select "SiteName" as name from "StationSites" where "Longitude" = ${siteLongitude} and "Latitude" = ${siteLatitude} limit 1`;
      if (sameSpot) throw new FieldError("SiteLatitude", `The site "${sameSpot.name}" already has these coordinates.`);
      add("StationSites", { _id: "site", ...row({ SiteName: siteName, Longitude: siteLongitude, Latitude: siteLatitude, "Elevation (FT)": siteElevation, SiteNotes: siteNotes }) });
      site = { $ref: "site" };
    }
  }

  // ----- Station (an existing station with this name in this project is reused) -----
  const existingStationId = typeof project === "number"
    ? await findByName(sql, "Stations", "StationID", "StationName", stationName, ["ProjectID", project])
    : null;
  let station: Ref;
  if (existingStationId !== null) station = existingStationId;
  else {
    add("Stations", { _id: "station", ...row({
      ProjectID: project, SiteID: site, StationTypeID: stationType, StationName: stationName,
      StationCode: text(f, "StationCode", "Station code", { max: 100 }), InstallDate: installDate,
      WebLink: text(f, "WebLink", "Web link", { max: 500 }), MesoWestLink: text(f, "MesoWestLink", "MesoWest link", { max: 500 }),
      IsActive: bool(f, "IsActive"), IsRealTime: bool(f, "IsRealTime"), IsSeasonal: bool(f, "IsSeasonal"),
      UpdateInterval: updateInterval === null ? null : `${updateInterval} minutes`,
      TransmitTime: transmitTime === null ? null : `${transmitTime} minutes`,
      Longitude: longitude, Latitude: latitude, // CoordinateLocation is generated from these
      "Elevation (FT)": elevationFt, StationNotes: text(f, "StationNotes", "Station notes"),
    }) });
    station = { $ref: "station" };
  }
  const stationIsNew = typeof station !== "number";

  /** True when a link row already exists (only possible when every id is a saved row). */
  const linked = async (table: string, match: Record<string, Ref>) => {
    if (Object.values(match).some((v) => typeof v !== "number")) return false;
    const conds = Object.entries(match).map(([c, v]) => sql`${sql(c)} = ${v as number}`);
    const rows = await sql`select 1 from ${sql(table)} where ${conds.reduce((a: unknown, b: unknown) => sql`${a} and ${b}`)} limit 1`;
    return rows.length > 0;
  };

  // ----- Organizations' roles at the station -----
  for (const r of [{ role: STATION_ROLES.primary, org }, ...roleOrgs]) {
    if (!(await linked("StationOrganizationRole", { OrganizationID: r.org, StationID: station, RoleID: r.role }))) {
      add("StationOrganizationRole", { OrganizationID: r.org, StationID: station, RoleID: r.role });
    }
  }

  // ----- What the station observes -----
  if (!(await linked("StationObservations", { StationID: station, ObservationTypeID: observationTypeId }))) {
    add("StationObservations", { StationID: station, ObservationTypeID: observationTypeId });
  }

  // ----- Station contact (one per station) -----
  if (stationIsNew) {
    add("StationContact", { StationID: station, ContactID: contact, RoleID: CONTACT_ROLE_ID });
  } else {
    const [current] = await sql`
      select sc."ContactID" as id, c."Email" as email
      from "StationContact" sc join "Contacts" c on c."ContactID" = sc."ContactID"
      where sc."StationID" = ${station as number}`;
    if (!current) add("StationContact", { StationID: station, ContactID: contact, RoleID: CONTACT_ROLE_ID });
    else if (typeof contact !== "number" || Number(current.id) !== contact) {
      throw new FieldError("ContactEmail", `The station "${stationName}" already has a different contact (${current.email}).`);
    }
  }

  // ----- Sensor (names are unique) -----
  const sensorId = await findByName(sql, "Sensors", "SensorID", "SensorName", sensorName);
  let sensor: Ref;
  if (sensorId !== null) sensor = sensorId;
  else {
    add("Sensors", { _id: "sensor", ...row({ SensorName: sensorName, SensorNotes: text(f, "SensorNotes", "Sensor notes"), SensorObservation: sensorObservation }) });
    sensor = { $ref: "sensor" };
  }

  // ----- Measurement unit (optional) -----
  let unit: Ref | null = null;
  if (unitName || unitSymbol) {
    const unitId = unitName
      ? await findByName(sql, "MeasurementUnits", "MeasurementUnitsID", "UnitName", unitName)
      : await findByName(sql, "MeasurementUnits", "MeasurementUnitsID", "UnitSymbol", unitSymbol!);
    if (unitId !== null) unit = unitId;
    else {
      if (unitSymbol) {
        const [clash] = await sql`select "UnitName" as name from "MeasurementUnits" where "UnitSymbol" = ${unitSymbol} limit 1`;
        if (clash) throw new FieldError("UnitSymbol", `The symbol "${unitSymbol}" already belongs to the unit "${clash.name}".`);
      }
      // Nulls (not empty text) so units without a name or symbol don't clash on the unique columns.
      add("MeasurementUnits", { _id: "unit", UnitName: unitName, UnitSymbol: unitSymbol });
      unit = { $ref: "unit" };
    }
  }

  // ----- Sensor at the station. Placement height is the station's relative elevation in meters. -----
  if (!(await linked("StationsToSensors", { StationID: station, SensorID: sensor }))) {
    add("StationsToSensors", row({
      StationID: station, SensorID: sensor,
      "PlacementHeight (Meters)": elevationFt === null ? null : Math.round(elevationFt * 0.3048 * 1000) / 1000,
      MeasurementUnitsID: unit,
    }));
  }

  // ----- Device (optional) -----
  if (manufacturerName) {
    const manufacturerId = await findByName(sql, "DeviceManufacturers", "ManufacturerID", "ManufacturerName", manufacturerName);
    let manufacturer: Ref;
    if (manufacturerId !== null) manufacturer = manufacturerId;
    else {
      add("DeviceManufacturers", { _id: "manufacturer", ...row({ ManufacturerName: manufacturerName, ManufacturerNotes: manufacturerNotes }) });
      manufacturer = { $ref: "manufacturer" };
    }

    if (hasModel) {
      // Match by model number if there is one, otherwise by model name.
      const specId = typeof manufacturer === "number"
        ? (modelNumber
          ? await findByName(sql, "DeviceSpecifications", "DeviceSpecificationID", "ModelNumber", modelNumber, ["ManufacturerID", manufacturer])
          : await findByName(sql, "DeviceSpecifications", "DeviceSpecificationID", "ModelName", modelName!, ["ManufacturerID", manufacturer]))
        : null;
      let spec: Ref;
      if (specId !== null) spec = specId;
      else {
        add("DeviceSpecifications", { _id: "spec", ...row({ ManufacturerID: manufacturer, ModelNumber: modelNumber, ModelName: modelName, ModelNotes: modelNotes }) });
        spec = { $ref: "spec" };
      }
      if (!(await linked("StationsToSpecs", { StationID: station, DeviceSpecificationID: spec }))) {
        add("StationsToSpecs", row({ StationID: station, DeviceSpecificationID: spec, SerialNumber: serialNumber }));
      }
      if (!(await linked("SensorsToSpecs", { SensorID: sensor, DeviceSpecificationID: spec }))) {
        add("SensorsToSpecs", row({ SensorID: sensor, DeviceSpecificationID: spec, SerialNumber: serialNumber }));
      }
    }
  }

  if (parts.length === 0) throw new RowError("Everything in this form is already saved. Nothing new to add.");
  return parts;
}

const BUILDERS: Record<FormName, (sql: Sql, f: Fields) => Promise<Part[]>> = {
  main: buildMain,
  organization: buildOrganization,
  project: buildProject,
  station: buildStation,
  device: buildDevice,
};

/**
 * Forms outside organizations may use through a link. Default: only the single "main" form.
 * The optional LINK_FORMS secret (comma-separated) can change that.
 */
export function linkForms(): FormName[] {
  const raw = Deno.env.get("LINK_FORMS");
  if (!raw) return ["main"];
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
