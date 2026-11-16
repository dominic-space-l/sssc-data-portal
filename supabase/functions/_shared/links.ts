// Links for outside organizations: creating them and checking them.
//
// Two kinds:
//   new  - add new data. Works ONCE, then it's used up.
//   edit - update data an organization already has. Belongs to one organization (organization_id)
//          and works any number of times until it expires. Every edit still needs admin approval.

import { submitPageUrl } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Sql = any;

export type LinkKind = "new" | "edit";

export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function linkDays(): number {
  const days = Number(Deno.env.get("LINK_DAYS") ?? "7");
  return Number.isFinite(days) && days > 0 && days <= 60 ? days : 7;
}

/**
 * Creates a link. Returns the full URL and expiry.
 * For an update link, pass { kind: "edit", organizationId }.
 */
export async function createLink(
  sql: Sql,
  requestId: string | null,
  opts: { kind?: LinkKind; organizationId?: number | null } = {},
) {
  const kind = opts.kind ?? "new";
  const organizationId = kind === "edit" ? opts.organizationId ?? null : null;
  if (kind === "edit" && organizationId === null) throw new Error("An update link needs an organization.");
  const code = newLinkCode();
  const [link] = await sql`
    insert into private.access_links (code, request_id, expires_at, kind, organization_id)
    values (${code}, ${requestId}, now() + make_interval(days => ${linkDays()}), ${kind}, ${organizationId})
    returning expires_at`;
  return { link: submitPageUrl(code), expiresAt: link.expires_at, kind };
}

export type LinkState =
  | {
    state: "valid";
    id: string;
    kind: LinkKind;
    organizationId: number | null;
    orgName: string | null;
    expiresAt: string;
  }
  | { state: "invalid" | "used" | "expired" | "revoked" };

/** Looks up a link code and says whether it can still be used. */
export async function checkLink(sql: Sql, code: string): Promise<LinkState> {
  if (!code || code.length > 100) return { state: "invalid" };
  const [link] = await sql`
    select l.id, l.kind, l.organization_id, l.used_at, l.revoked_at, l.expires_at,
           (l.expires_at < now()) as expired,
           coalesce(o."OrganizationName", r.org_name) as org_name
    from private.access_links l
    left join private.access_requests r on r.id = l.request_id
    left join public."Organizations" o on o."OrganizationID" = l.organization_id
    where l.code = ${code}`;
  if (!link) return { state: "invalid" };
  if (link.revoked_at) return { state: "revoked" };
  if (link.used_at) return { state: "used" };
  if (link.expired) return { state: "expired" };
  return {
    state: "valid",
    id: link.id,
    kind: link.kind,
    organizationId: link.organization_id === null ? null : Number(link.organization_id),
    orgName: link.org_name,
    expiresAt: link.expires_at,
  };
}
