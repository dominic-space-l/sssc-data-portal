// One-time links: creating them and checking them.

import { siteUrl } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Sql = any;

export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function linkDays(): number {
  const days = Number(Deno.env.get("LINK_DAYS") ?? "7");
  return Number.isFinite(days) && days > 0 && days <= 60 ? days : 7;
}

/** Creates a new one-time link for an access request. Returns the full URL and expiry. */
export async function createLink(sql: Sql, requestId: string | null) {
  const code = newLinkCode();
  const [link] = await sql`
    insert into private.access_links (code, request_id, expires_at)
    values (${code}, ${requestId}, now() + make_interval(days => ${linkDays()}))
    returning expires_at`;
  return { link: `${siteUrl()}/submit.html?code=${code}`, expiresAt: link.expires_at };
}

export type LinkState =
  | { state: "valid"; id: string; orgName: string | null; expiresAt: string }
  | { state: "invalid" | "used" | "expired" | "revoked" };

/** Looks up a link code and says whether it can still be used. */
export async function checkLink(sql: Sql, code: string): Promise<LinkState> {
  if (!code || code.length > 100) return { state: "invalid" };
  const [link] = await sql`
    select l.id, l.used_at, l.revoked_at, l.expires_at, (l.expires_at < now()) as expired, r.org_name
    from private.access_links l
    left join private.access_requests r on r.id = l.request_id
    where l.code = ${code}`;
  if (!link) return { state: "invalid" };
  if (link.revoked_at) return { state: "revoked" };
  if (link.used_at) return { state: "used" };
  if (link.expired) return { state: "expired" };
  return { state: "valid", id: link.id, orgName: link.org_name, expiresAt: link.expires_at };
}
