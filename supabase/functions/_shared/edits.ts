// Edits: an outside organization updates data it already has. Every edit waits for admin approval.
//
// Who can edit what (by role in StationOrganizationRole):
//   Primary Owner, Secondary Owner, Maintainer  -> can edit that station, its contact, devices and sensors
//   Data Provider                               -> can't edit
//   Contacts that belong to the organization    -> can be edited
//
// An edit is stored as a list of "changes". Each change remembers the row's values BEFORE the edit,
// so the admin sees before -> after, and approval stops if someone changed that row in the meantime.
//
//   { op: "update", table, key, before, after, label }   change some columns of one row
//   { op: "delete", table, key, before, label }          remove one row (e.g. a device from a station)
//   { op: "insert", table, row, _id?, label }            add one row (e.g. a new contact)
//
// `key` finds the row (column -> value). Inserted rows can be labelled with `_id` and
// referenced later with { "$ref": "label" }, like in rows.ts.

import { primaryKey, RowError, Rollback, friendlyDbError } from "./rows.ts";
import {
  bool, date, email, FieldError, type Fields, id, likeExact, mustExist, number, STATION_ROLES, text,
} from "./forms.ts";

// deno-lint-ignore no-explicit-any
type Sql = any;
type Values = Record<string, unknown>;

export type Change =
  | { op: "update"; table: string; key: Values; before: Values; after: Values; label: string }
  | { op: "delete"; table: string; key: Values; before: Values; label: string }
  | { op: "insert"; table: string; row: Values; _id?: string; label: string };

/** Roles that may edit a station. */
export const EDITOR_ROLES = [STATION_ROLES.primary, STATION_ROLES.secondary, STATION_ROLES.maintainer];

export const EDITS = ["station", "station_contact", "contact", "device", "sensor"] as const;
export type EditName = typeof EDITS[number];

/** Approval found that the data changed since the edit was sent. */
export class EditConflict extends Error {}

// ---------------------------------------------------------------------------
// Comparing values
// ---------------------------------------------------------------------------

type Kind = "text" | "bool" | "number" | "other";

/** Treats "" and null as the same for text, null and false as the same for yes/no. */
function same(a: unknown, b: unknown, kind: Kind = "other"): boolean {
  if (kind === "text") return (a ?? "") === (b ?? "") || String(a ?? "") === String(b ?? "");
  if (kind === "bool") return Boolean(a) === Boolean(b);
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (kind === "number" || (typeof a === "number" || typeof b === "number")) {
    const x = Number(a), y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x === y;
  }
  return String(a) === String(b);
}

/** Exact comparison used at approval time (values on both sides come from the database). */
function sameStored(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || same(a, b);
}

/** Builds an update change with only the columns that really changed. */
function diff(table: string, key: Values, current: Values, wanted: Record<string, { value: unknown; kind: Kind }>, label: string): Change[] {
  const before: Values = {};
  const after: Values = {};
  for (const [col, { value, kind }] of Object.entries(wanted)) {
    if (!same(current[col], value, kind)) {
      before[col] = current[col] ?? null;
      after[col] = value;
    }
  }
  return Object.keys(after).length ? [{ op: "update", table, key, before, after, label }] : [];
}

// ---------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------

function where(sql: Sql, key: Values) {
  const parts = Object.entries(key).map(([col, val]) => sql`${sql(col)} is not distinct from ${val as never}`);
  return parts.reduce((all, p) => sql`${all} and ${p}`);
}

/** One row as plain JSON values (to_jsonb), plus its physical location so it can be updated. */
async function readRow(sql: Sql, table: string, key: Values, lock = false): Promise<{ loc: string; data: Values } | null> {
  const rows = lock
    ? await sql`select t.ctid::text as loc, to_jsonb(t) as data from ${sql(table)} t where ${where(sql, key)} limit 1 for update`
    : await sql`select t.ctid::text as loc, to_jsonb(t) as data from ${sql(table)} t where ${where(sql, key)} limit 1`;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// What an organization can see and edit
// ---------------------------------------------------------------------------

async function editableStationIds(sql: Sql, orgId: number): Promise<Set<number>> {
  const rows = await sql`
    select distinct "StationID" as id from "StationOrganizationRole"
    where "OrganizationID" = ${orgId} and "RoleID" in ${sql(EDITOR_ROLES)}`;
  return new Set(rows.map((r: { id: unknown }) => Number(r.id)));
}

async function mustOwnStation(sql: Sql, orgId: number, stationId: number | null): Promise<number> {
  if (stationId === null || !(await editableStationIds(sql, orgId)).has(stationId)) {
    throw new RowError("You can only edit stations your organization owns or maintains.");
  }
  return stationId;
}

/** The organization's stations (owner/maintainer) and its contacts, for the update page. */
export async function recordsFor(sql: Sql, orgId: number) {
  const [org] = await sql`select "OrganizationID" as id, "OrganizationName" as name from "Organizations" where "OrganizationID" = ${orgId}`;
  if (!org) throw new RowError("This organization no longer exists.");
  const stations = await sql`
    select s."StationID" as id, s."StationName" as name, s."StationCode" as code,
           array_agg(distinct coalesce(r."RoleTitle", 'Role ' || sor."RoleID") order by coalesce(r."RoleTitle", 'Role ' || sor."RoleID")) as roles
    from "StationOrganizationRole" sor
    join "Stations" s on s."StationID" = sor."StationID"
    left join "StationRoles" r on r."RoleID" = sor."RoleID"
    where sor."OrganizationID" = ${orgId} and sor."RoleID" in ${sql(EDITOR_ROLES)}
    group by s."StationID", s."StationName", s."StationCode"
    order by s."StationName"`;
  const contacts = await sql`
    select "ContactID" as id, "Email" as email, "FirstName" as "firstName", "LastName" as "lastName", "ContactNotes" as notes
    from "Contacts" where "OrganizationID" = ${orgId} order by "LastName", "FirstName", "Email"`;
  return { organization: { id: Number(org.id), name: org.name }, stations, contacts };
}

const minutes = (v: unknown) => {
  const m = String(v ?? "").match(/\d+/);
  return m ? m[0] : "";
};

/** Current values of one station, its contacts, devices and sensors: used to fill in the edit forms. */
export async function stationDetails(sql: Sql, orgId: number, stationId: number | null) {
  const sid = await mustOwnStation(sql, orgId, stationId);
  const [s] = await sql`select * from "Stations" where "StationID" = ${sid}`;
  const contacts = await sql`
    select c."ContactID" as id, c."Email" as email, c."FirstName" as "firstName", c."LastName" as "lastName"
    from "StationContact" sc join "Contacts" c on c."ContactID" = sc."ContactID"
    where sc."StationID" = ${sid} order by c."LastName", c."FirstName"`;
  const devices = await sql`
    select d."DeviceSpecificationID" as "deviceSpecificationId", m."ManufacturerName" as manufacturer,
           d."ModelNumber" as "modelNumber", d."ModelName" as "modelName", sts."SerialNumber" as "serialNumber"
    from "StationsToSpecs" sts
    join "DeviceSpecifications" d on d."DeviceSpecificationID" = sts."DeviceSpecificationID"
    left join "DeviceManufacturers" m on m."ManufacturerID" = d."ManufacturerID"
    where sts."StationID" = ${sid} order by m."ManufacturerName", d."ModelNumber"`;
  const sensors = await sql`
    select x."SensorID" as "sensorId", se."SensorName" as "sensorName", x."Count" as count,
           x."PlacementHeight (Meters)" as "placementHeightMeters", x."PlacementNotes" as "placementNotes"
    from "StationsToSensors" x join "Sensors" se on se."SensorID" = x."SensorID"
    where x."StationID" = ${sid} order by se."SensorName"`;

  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    station: {
      StationID: Number(s.StationID),
      StationName: str(s.StationName),
      StationCode: str(s.StationCode),
      StationTypeID: str(s.StationTypeID),
      SiteID: str(s.SiteID),
      InstallDate: s.InstallDate ? new Date(s.InstallDate).toISOString().slice(0, 10) : "",
      IsActive: s.IsActive === true,
      IsRealTime: s.IsRealTime === true,
      IsSeasonal: s.IsSeasonal === true,
      UpdateIntervalMinutes: minutes(s.UpdateInterval),
      TransmitTimeMinutes: minutes(s.TransmitTime),
      Longitude: str(s.Longitude),
      Latitude: str(s.Latitude),
      ElevationFt: str(s["Elevation (FT)"]),
      WebLink: str(s.WebLink),
      MesoWestLink: str(s.MesoWestLink),
      StationNotes: str(s.StationNotes),
    },
    contacts,
    devices,
    sensors: sensors.map((x: Values) => ({ ...x, placementHeightMeters: x.placementHeightMeters === null ? null : Number(x.placementHeightMeters) })),
  };
}

// ---------------------------------------------------------------------------
// Edit builders: check the fields, compare with what's saved, return the changes
// ---------------------------------------------------------------------------

type Target = Record<string, unknown>;
const targetId = (t: Target, key: string) => {
  const v = Number(t[key]);
  return Number.isInteger(v) && v > 0 ? v : null;
};

async function editStation(sql: Sql, orgId: number, t: Target, f: Fields): Promise<Change[]> {
  const sid = await mustOwnStation(sql, orgId, targetId(t, "stationId"));
  const current = await readRow(sql, "Stations", { StationID: sid });
  if (!current) throw new RowError("That station no longer exists.");
  const s = current.data;

  const name = text(f, "StationName", "Station name", { required: true, max: 200 })!;
  const typeId = id(f, "StationTypeID", "Station type", true);
  const siteId = id(f, "SiteID", "Site");
  const longitude = number(f, "Longitude", "Longitude", { required: true, min: -180, max: 180 })!;
  const latitude = number(f, "Latitude", "Latitude", { required: true, min: -90, max: 90 })!;
  const update = number(f, "UpdateIntervalMinutes", "Update interval", { whole: true, min: 0 });
  const transmit = number(f, "TransmitTimeMinutes", "Transmit time", { whole: true, min: 0 });
  await mustExist(sql, "StationTypes", "TypeID", typeId, "StationTypeID", "station type");
  await mustExist(sql, "StationSites", "SiteID", siteId, "SiteID", "site");

  const sameMinutes = (stored: unknown, wanted: number | null) =>
    wanted === null ? !minutes(stored) : minutes(stored) === String(wanted);

  const wanted: Record<string, { value: unknown; kind: Kind }> = {
    StationName: { value: name, kind: "text" },
    StationCode: { value: text(f, "StationCode", "Station code", { max: 100 }) ?? "", kind: "text" },
    StationTypeID: { value: typeId, kind: "number" },
    SiteID: { value: siteId, kind: "number" },
    InstallDate: { value: date(f, "InstallDate", "Install date"), kind: "other" },
    IsActive: { value: bool(f, "IsActive"), kind: "bool" },
    IsRealTime: { value: bool(f, "IsRealTime"), kind: "bool" },
    IsSeasonal: { value: bool(f, "IsSeasonal"), kind: "bool" },
    Longitude: { value: longitude, kind: "number" },
    Latitude: { value: latitude, kind: "number" },
    "Elevation (FT)": { value: number(f, "ElevationFt", "Elevation", { whole: true }), kind: "number" },
    WebLink: { value: text(f, "WebLink", "Web link", { max: 500 }) ?? "", kind: "text" },
    MesoWestLink: { value: text(f, "MesoWestLink", "MesoWest link", { max: 500 }) ?? "", kind: "text" },
    StationNotes: { value: text(f, "StationNotes", "Station notes") ?? "", kind: "text" },
  };
  // Stored as text like "15 minutes": only counts as a change if the number of minutes differs.
  if (!sameMinutes(s.UpdateInterval, update)) wanted.UpdateInterval = { value: update === null ? "" : `${update} minutes`, kind: "text" };
  if (!sameMinutes(s.TransmitTime, transmit)) wanted.TransmitTime = { value: transmit === null ? "" : `${transmit} minutes`, kind: "text" };

  const changes = diff("Stations", { StationID: sid }, s, wanted, `Station "${s.StationName}"`);
  const c = changes[0];
  if (c && c.op === "update" && ("Longitude" in c.after || "Latitude" in c.after)) {
    c.before.CoordinateLocation = s.CoordinateLocation ?? null;
    c.after.CoordinateLocation = `SRID=4326;POINT(${longitude} ${latitude})`;
  }
  return changes;
}

/** Replaces the station's contact(s) with one person (an existing contact with that email, or a new one). */
async function replaceStationContact(sql: Sql, orgId: number, t: Target, f: Fields): Promise<Change[]> {
  const sid = await mustOwnStation(sql, orgId, targetId(t, "stationId"));
  const [station] = await sql`select "StationName" from "Stations" where "StationID" = ${sid}`;
  const label = `Station "${station.StationName}" contact`;
  const mail = email(f, "ContactEmail", "Contact email");
  const first = text(f, "ContactFirstName", "First name", { required: true, max: 100 });
  const last = text(f, "ContactLastName", "Last name", { required: true, max: 100 });

  const links = await sql`
    select sc."ContactID", sc."RoleID", c."Email"
    from "StationContact" sc join "Contacts" c on c."ContactID" = sc."ContactID"
    where sc."StationID" = ${sid}`;
  const [existing] = await sql`select "ContactID" from "Contacts" where "Email" ilike ${likeExact(mail)} limit 1`;
  const existingId = existing ? Number(existing.ContactID) : null;
  if (existingId !== null && links.length === 1 && Number(links[0].ContactID) === existingId) {
    throw new FieldError("ContactEmail", "That person is already the station's contact.");
  }

  const changes: Change[] = [];
  if (existingId === null) {
    changes.push({
      op: "insert", table: "Contacts", _id: "contact", label: `New contact ${first} ${last}`,
      row: { OrganizationID: orgId, Email: mail, FirstName: first, LastName: last, ContactNotes: text(f, "ContactNotes", "Contact notes") ?? "" },
    });
  }
  for (const l of links) {
    if (existingId !== null && Number(l.ContactID) === existingId) continue; // keep them, they're the new contact
    const key = { StationID: sid, ContactID: Number(l.ContactID) };
    changes.push({ op: "delete", table: "StationContact", key, before: { ...key, RoleID: l.RoleID === null ? null : Number(l.RoleID), Email: l.Email }, label: `${label}: remove ${l.Email}` });
  }
  if (!links.some((l: Values) => existingId !== null && Number(l.ContactID) === existingId)) {
    changes.push({
      op: "insert", table: "StationContact", label: `${label}: add ${mail}`,
      row: { StationID: sid, ContactID: existingId ?? { $ref: "contact" }, RoleID: STATION_ROLES.primary },
    });
  }
  return changes;
}

/** Name, email and notes of one of the organization's own contacts. */
async function editContact(sql: Sql, orgId: number, t: Target, f: Fields): Promise<Change[]> {
  const cid = targetId(t, "contactId");
  const current = cid === null ? null : await readRow(sql, "Contacts", { ContactID: cid });
  if (!current || Number(current.data.OrganizationID) !== orgId) {
    throw new RowError("You can only edit your own organization's contacts.");
  }
  const mail = email(f, "Email", "Email");
  const [taken] = await sql`
    select 1 from "Contacts" where "Email" ilike ${likeExact(mail)} and "ContactID" <> ${cid} limit 1`;
  if (taken) throw new FieldError("Email", "Another contact already uses that email.");
  const c = current.data;
  return diff("Contacts", { ContactID: cid }, c, {
    Email: { value: mail, kind: "text" },
    FirstName: { value: text(f, "FirstName", "First name", { required: true, max: 100 }), kind: "text" },
    LastName: { value: text(f, "LastName", "Last name", { required: true, max: 100 }), kind: "text" },
    ContactNotes: { value: text(f, "ContactNotes", "Notes") ?? "", kind: "text" },
  }, `Contact ${c.FirstName ?? ""} ${c.LastName ?? ""} (${c.Email})`.replace(/\s+/g, " "));
}

/** Serial number of a device at a station, or remove the device from the station. */
async function editDevice(sql: Sql, orgId: number, t: Target, f: Fields): Promise<Change[]> {
  const sid = await mustOwnStation(sql, orgId, targetId(t, "stationId"));
  const specId = targetId(t, "deviceSpecificationId");
  const oldSerial = typeof t.serialNumber === "string" && t.serialNumber !== "" ? t.serialNumber : null;
  const key = { StationID: sid, DeviceSpecificationID: specId, SerialNumber: oldSerial };
  const current = specId === null ? null : await readRow(sql, "StationsToSpecs", key);
  if (!current) throw new RowError("That device isn't at this station anymore.");
  const [d] = await sql`
    select m."ManufacturerName" as m, d."ModelNumber" as n
    from "DeviceSpecifications" d left join "DeviceManufacturers" m on m."ManufacturerID" = d."ManufacturerID"
    where d."DeviceSpecificationID" = ${specId}`;
  const [station] = await sql`select "StationName" from "Stations" where "StationID" = ${sid}`;
  const label = `Device ${d?.m ?? ""} ${d?.n ?? ""} at "${station.StationName}"`.replace(/\s+/g, " ");

  if (bool(f, "Remove")) return [{ op: "delete", table: "StationsToSpecs", key, before: current.data, label: `${label}: remove` }];
  return diff("StationsToSpecs", key, current.data, {
    SerialNumber: { value: text(f, "SerialNumber", "Serial number", { max: 200 }), kind: "text" },
  }, label);
}

/** Count, height and notes of a sensor at a station, or remove it from the station. */
async function editSensor(sql: Sql, orgId: number, t: Target, f: Fields): Promise<Change[]> {
  const sid = await mustOwnStation(sql, orgId, targetId(t, "stationId"));
  const sensorId = targetId(t, "sensorId");
  const key = { StationID: sid, SensorID: sensorId };
  const current = sensorId === null ? null : await readRow(sql, "StationsToSensors", key);
  if (!current) throw new RowError("That sensor isn't at this station anymore.");
  const [se] = await sql`select "SensorName" from "Sensors" where "SensorID" = ${sensorId}`;
  const [station] = await sql`select "StationName" from "Stations" where "StationID" = ${sid}`;
  const label = `Sensor ${se?.SensorName ?? sensorId} at "${station.StationName}"`;

  if (bool(f, "Remove")) return [{ op: "delete", table: "StationsToSensors", key, before: current.data, label: `${label}: remove` }];
  return diff("StationsToSensors", key, current.data, {
    Count: { value: number(f, "Count", "Count", { whole: true, min: 0, max: 32767 }), kind: "number" },
    "PlacementHeight (Meters)": { value: number(f, "PlacementHeightMeters", "Placement height", { min: -1000, max: 10000 }), kind: "number" },
    PlacementNotes: { value: text(f, "PlacementNotes", "Placement notes") ?? "", kind: "text" },
  }, label);
}

const BUILDERS: Record<EditName, (sql: Sql, orgId: number, t: Target, f: Fields) => Promise<Change[]>> = {
  station: editStation,
  station_contact: replaceStationContact,
  contact: editContact,
  device: editDevice,
  sensor: editSensor,
};

export function isEdit(name: unknown): name is EditName {
  return typeof name === "string" && (EDITS as readonly string[]).includes(name);
}

/** Checks an edit and returns its changes. Throws if nothing would change. */
export async function buildEdit(sql: Sql, orgId: number, edit: unknown, target: unknown, fields: unknown): Promise<Change[]> {
  if (!isEdit(edit)) throw new RowError("Unknown kind of edit.");
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new RowError("Missing what to edit.");
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new RowError("Missing form fields.");
  const changes = await BUILDERS[edit](sql, orgId, target as Target, fields as Fields);
  if (changes.length === 0) throw new RowError("Nothing changed. Edit a field before sending.");
  return changes;
}

// ---------------------------------------------------------------------------
// Applying (on approval)
// ---------------------------------------------------------------------------

/** Applies the changes in order inside the caller's transaction. Throws EditConflict if data moved on. */
export async function applyChanges(tx: Sql, changes: Change[]): Promise<number> {
  const ids = new Map<string, unknown>();
  const resolve = (row: Values) => Object.fromEntries(Object.entries(row).map(([k, v]) =>
    [k, v && typeof v === "object" && "$ref" in (v as Values) ? ids.get(String((v as Values).$ref)) : v]));
  let applied = 0;

  for (const c of changes) {
    if (c.op === "insert") {
      const row = resolve(c.row);
      const cols = Object.keys(row);
      const pk = c._id ? await primaryKey(tx, c.table) : null;
      const [inserted] = await tx`
        insert into ${tx(c.table)} (${tx(cols)})
        select ${tx(cols)} from jsonb_populate_record(null::${tx(c.table)}, ${tx.json(row)})
        returning ${pk ? tx(pk) : tx`1`} as id`;
      if (c._id) ids.set(c._id, inserted.id);
      applied++;
      continue;
    }

    const current = await readRow(tx, c.table, c.key, true);
    if (!current) throw new EditConflict(`${c.label}: this row no longer exists, so the edit can't be applied.`);
    for (const [col, was] of Object.entries(c.before)) {
      if (col in current.data && !sameStored(current.data[col], was)) {
        throw new EditConflict(`${c.label}: "${col}" was changed after this edit was sent. Reject it and ask them to send it again.`);
      }
    }
    if (c.op === "delete") {
      await tx`delete from ${tx(c.table)} where ctid = ${current.loc}::tid`;
    } else {
      const cols = Object.keys(c.after);
      await tx`
        update ${tx(c.table)} set (${tx(cols)}) = (
          select ${tx(cols)} from jsonb_populate_record(null::${tx(c.table)}, ${tx.json(c.after)}))
        where ctid = ${current.loc}::tid`;
    }
    applied++;
  }
  return applied;
}

/** Tries the changes and undoes them. Returns an error message, or null if they'd work. */
export async function dryRunChanges(sql: Sql, changes: Change[]): Promise<string | null> {
  try {
    await sql.begin(async (tx: Sql) => {
      await applyChanges(tx, changes);
      throw new Rollback();
    });
    return null;
  } catch (err) {
    if (err instanceof Rollback) return null;
    if (err instanceof EditConflict || err instanceof RowError) return err.message;
    return friendlyDbError(err);
  }
}

/** Checks changes read back from the database before applying them (they were built by this code). */
export function readChanges(raw: unknown): Change[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new RowError("This edit has no changes.");
  for (const c of raw) {
    if (!c || typeof c !== "object" || !["update", "delete", "insert"].includes((c as Values).op as string)) {
      throw new RowError("This edit is damaged and can't be applied.");
    }
  }
  return raw as Change[];
}
