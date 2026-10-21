// Direct database connection for Edge Functions (server side only).
// Uses SUPABASE_DB_URL, which Supabase provides to every Edge Function automatically.
// This is how the functions reach the `private` schema, which the website itself can't see.

import postgres from "npm:postgres@3.4.5";

let sql: ReturnType<typeof postgres> | null = null;

export function db() {
  if (!sql) {
    const url = Deno.env.get("SUPABASE_DB_URL");
    if (!url) throw new Error("Missing SUPABASE_DB_URL");
    sql = postgres(url, { prepare: false, max: 1 });
  }
  return sql;
}
