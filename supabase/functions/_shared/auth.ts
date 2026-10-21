// Confirms the caller is a logged-in user. Sign-ups are off, so a logged-in user is the admin.

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

/** Returns { id, email } for the logged-in caller, or null. */
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
