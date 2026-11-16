// Confirms the caller is a signed-in ADMIN: a valid Supabase Auth user who is also listed in
// auth_private.admins. Being signed in alone is not enough.

import { requireEnv } from "./http.ts";

function publicApiKey(): string {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) {
    const first = Object.values(JSON.parse(keys))[0];
    if (typeof first === "string") return first;
  }
  throw new Error("No public API key available to the function");
}

/** Returns { id, email } for the signed-in caller, or null. Doesn't check the admin list. */
export async function getCaller(req: Request): Promise<{ id: string; email: string } | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const res = await fetch(`${requireEnv("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: publicApiKey() },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? { id: user.id, email: user.email } : null;
}


// deno-lint-ignore no-explicit-any
type Sql = any;

/** Returns { id, email } when the caller is signed in AND listed in auth_private.admins, else null. */
export async function getAdmin(req: Request, sql: Sql): Promise<{ id: string; email: string } | null> {
  const caller = await getCaller(req);
  if (!caller) return null;
  const [row] = await sql`select 1 as ok from auth_private.admins where user_id = ${caller.id}`;
  return row ? caller : null;
}
