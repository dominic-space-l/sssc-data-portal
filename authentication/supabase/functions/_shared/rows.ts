// Checking and saving submissions.
//
// A submission is a list of "parts", one per table, saved in order:
//   [
//     { "table": "Stations", "rows": [ { "_id": "new-station", "StationName": "Ridge 4" } ] },
//     { "table": "StationsToSensors", "rows": [ { "StationID": { "$ref": "new-station" }, "SensorID": 3 } ] }
//   ]
//
// "_id" gives a NEW row a temporary label. { "$ref": "label" } means "the ID of that new row".
// On save, each labelled row is inserted first, its real ID is filled into every $ref, then the next rows go in.
// Rows are only ever saved into tables listed in the ALLOWED_TABLES secret (comma-separated).

// deno-lint-ignore no-explicit-any
type Sql = any;
type Value = string | number | boolean | null | { $ref: string };
type Row = Record<string, Value>;
export type Part = { table: string; rows: Row[] };

export const MAX_ROWS = 1000;
export const MAX_PARTS = 20;

export class RowError extends Error {}

/** Tables outside organizations may submit to, from the ALLOWED_TABLES secret. */
export function allowedTables(): string[] {
  return (Deno.env.get("ALLOWED_TABLES") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

export function assertAllowedTable(table: unknown): string {
  if (typeof table !== "string" || !allowedTables().includes(table)) {
    throw new RowError(`The table "${String(table)}" isn't open for submissions.`);
  }
  return table;
}

const isRef = (v: unknown): v is { $ref: string } =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 &&
  typeof (v as Record<string, unknown>).$ref === "string";

/**
 * Accepts { parts: [...] } or the older { table, rows } and returns clean parts.
 * Checks sizes, value types, and that every $ref points to a labelled row that comes earlier.
 */
export function normalizeParts(body: Record<string, unknown>, opts: { anyTable?: boolean } = {}): Part[] {
  const rawParts = Array.isArray(body.parts) ? body.parts : [{ table: body.table, rows: body.rows }];
  if (rawParts.length === 0) throw new RowError("Nothing to submit.");
  if (rawParts.length > MAX_PARTS) throw new RowError(`Too many tables in one submission. The limit is ${MAX_PARTS}.`);

  const labels = new Set<string>();
  let total = 0;

  return rawParts.map((rawPart, p) => {
    if (!rawPart || typeof rawPart !== "object") throw new RowError(`Part ${p + 1} is malformed.`);
    const part = rawPart as Record<string, unknown>;
    const table = opts.anyTable
      ? (typeof part.table === "string" && part.table ? part.table : (() => { throw new RowError(`Part ${p + 1} has no table.`); })())
      : assertAllowedTable(part.table);
    const rawRows = Array.isArray(part.rows) ? part.rows : [part.rows];
    if (rawRows.length === 0 || rawRows[0] == null) throw new RowError(`${table}: nothing to submit.`);
    total += rawRows.length;
    if (total > MAX_ROWS) throw new RowError(`Too many rows. The limit is ${MAX_ROWS}.`);

    const rows = rawRows.map((rawRow, i) => {
      const where = `${table}, row ${i + 1}`;
      if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
        throw new RowError(`${where} isn't a set of column values.`);
      }
      const clean: Row = {};
      for (const [key, value] of Object.entries(rawRow)) {
        if (key === "_id") continue;
        if (value === null || typeof value === "number" || typeof value === "boolean") clean[key] = value;
        else if (typeof value === "string") clean[key] = value.slice(0, 5000);
        else if (isRef(value)) {
          if (!labels.has(value.$ref)) {
            throw new RowError(`${where}, column "${key}": "${value.$ref}" must be a new row labelled earlier in the submission.`);
          }
          clean[key] = { $ref: value.$ref };
        } else throw new RowError(`${where}, column "${key}": only plain values are allowed.`);
      }
      if (Object.keys(clean).length === 0) throw new RowError(`${where} is empty.`);
      const label = (rawRow as Record<string, unknown>)._id;
      if (label !== undefined) {
        if (typeof label !== "string" || !label || label.length > 100) throw new RowError(`${where}: "_id" must be a short text label.`);
        if (labels.has(label)) throw new RowError(`${where}: the label "${label}" is used twice.`);
        labels.add(label);
        return { ...clean, _id: label } as Row;
      }
      return clean;
    });
    return { table, rows };
  });
}

export const rowCount = (parts: Part[]) => parts.reduce((n, p) => n + p.rows.length, 0);

/** Checks every column name against the real table. Returns the column list to insert. */
async function writableKeys(sql: Sql, table: string, rows: Row[]): Promise<string[]> {
  const columns = await sql`
    select column_name, is_generated, identity_generation
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}`;
  const writable = new Set(
    columns
      .filter((c: Record<string, string>) => c.is_generated === "NEVER" && c.identity_generation !== "ALWAYS")
      .map((c: Record<string, string>) => c.column_name),
  );
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)).filter((k) => k !== "_id"))];
  if (writable.size === 0) throw new RowError(`There is no table called "${table}".`);
  const unknown = keys.filter((k) => !writable.has(k));
  if (unknown.length) throw new RowError(`${table}: unknown or read-only column(s): ${unknown.join(", ")}`);
  return keys;
}

async function primaryKey(sql: Sql, table: string): Promise<string> {
  const quoted = `public."${table.replaceAll('"', '""')}"`;
  const cols = await sql`
    select a.attname as name
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = ${quoted}::regclass and i.indisprimary`;
  if (cols.length !== 1) throw new RowError(`${table}: new rows can only be labelled in tables with a single ID column.`);
  return cols[0].name;
}

async function insertRows(sql: Sql, table: string, rows: Row[], keys: string[], returning: string | null) {
  const data = rows.map(({ _id, ...rest }) => rest);
  return returning
    ? await sql`
        insert into ${sql(table)} (${sql(keys)})
        select ${sql(keys)} from jsonb_populate_recordset(null::${sql(table)}, ${sql.json(data)})
        returning ${sql(returning)} as id`
    : await sql`
        insert into ${sql(table)} (${sql(keys)})
        select ${sql(keys)} from jsonb_populate_recordset(null::${sql(table)}, ${sql.json(data)})
        returning 1`;
}

/** Saves every part in order, filling in $refs as new rows get their real IDs. Returns rows saved. */
export async function insertParts(sql: Sql, parts: Part[]): Promise<number> {
  const ids = new Map<string, unknown>();
  let saved = 0;

  // Swaps each { $ref } for the real ID of a row saved earlier.
  const resolve = (row: Row): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) out[k] = isRef(v) ? ids.get(v.$ref) as Value : v;
    return out;
  };

  for (const part of parts) {
    const keys = await writableKeys(sql, part.table, part.rows);
    const labelled = part.rows.some((r) => typeof r._id === "string");

    if (!labelled) {
      saved += (await insertRows(sql, part.table, part.rows.map(resolve), keys, null)).length;
      continue;
    }
    // Labelled rows go in one at a time so each one's new ID can be captured
    // (later rows in the same table can point to earlier ones).
    const pk = await primaryKey(sql, part.table);
    for (const row of part.rows) {
      const [inserted] = await insertRows(sql, part.table, [resolve(row)], keys, pk);
      if (typeof row._id === "string") ids.set(row._id, inserted.id);
      saved += 1;
    }
  }
  return saved;
}

class Rollback extends Error {}

/** Tries the whole save and then undoes it. Returns an error message, or null if it would work. */
export async function dryRun(sql: Sql, parts: Part[]): Promise<string | null> {
  try {
    await sql.begin(async (tx: Sql) => {
      await insertParts(tx, parts);
      throw new Rollback();
    });
    return null;
  } catch (err) {
    if (err instanceof Rollback) return null;
    if (err instanceof RowError) return err.message;
    return friendlyDbError(err);
  }
}

export function friendlyDbError(err: unknown): string {
  // deno-lint-ignore no-explicit-any
  const e = err as any;
  return `The data doesn't fit the table: ${e?.message ?? "unknown error"}${e?.detail ? ` (${e.detail})` : ""}`;
}

// ---------------------------------------------------------------------------
// Dropdown lists for the link form (LOOKUP_TABLES secret, comma-separated)
// ---------------------------------------------------------------------------

export function lookupTables(): string[] {
  return (Deno.env.get("LOOKUP_TABLES") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

export async function readLookup(sql: Sql, table: unknown) {
  if (typeof table !== "string" || !lookupTables().includes(table)) {
    throw new RowError(`The list "${String(table)}" isn't available.`);
  }
  return await sql`select * from ${sql(table)} limit 1000`;
}
