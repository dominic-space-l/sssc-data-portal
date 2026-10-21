// ADMIN-ONLY function: everything the admin dashboard does behind the scenes.
// Deploy normally (JWT verification ON). It also double-checks the caller is logged in.
//
// Actions (send { "action": "...", ... } in the body):
//   list_requests                      -> pending access requests
//   approve_request { id }             -> marks approved, creates a one-time link, returns it
//   reject_request  { id }             -> marks rejected
// Day 4 adds the submission actions here.
//
// Secrets used: SITE_URL, LINK_DAYS (optional, default 7)

import { json, preflight, readJson, siteUrl } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";

function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function linkDays(): number {
  const days = Number(Deno.env.get("LINK_DAYS") ?? "7");
  return Number.isFinite(days) && days > 0 && days <= 60 ? days : 7;
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const caller = await getCaller(req);
  if (!caller) return json({ ok: false, message: "Please log in." }, 401);

  try {
    const body = await readJson(req);
    const sql = db();

    switch (body.action) {
      case "list_requests": {
        const requests = await sql`
          select id, org_name, contact_name, email, reason, created_at
          from private.access_requests
          where status = 'pending'
          order by created_at`;
        return json({ ok: true, requests });
      }

      case "approve_request": {
        if (!isUuid(body.id)) return json({ ok: false, message: "Missing request id." }, 400);
        const result = await sql.begin(async (tx) => {
          const [request] = await tx`
            update private.access_requests
            set status = 'approved', reviewed_at = now()
            where id = ${body.id} and status = 'pending'
            returning id, org_name, email`;
          if (!request) return null;
          const code = newLinkCode();
          const [link] = await tx`
            insert into private.access_links (code, request_id, expires_at)
            values (${code}, ${request.id}, now() + make_interval(days => ${linkDays()}))
            returning expires_at`;
          return { request, code, expiresAt: link.expires_at };
        });
        if (!result) return json({ ok: false, message: "That request was already handled." }, 409);
        return json({
          ok: true,
          email: result.request.email,
          orgName: result.request.org_name,
          link: `${siteUrl()}/submit.html?code=${result.code}`,
          expiresAt: result.expiresAt,
        });
      }

      case "reject_request": {
        if (!isUuid(body.id)) return json({ ok: false, message: "Missing request id." }, 400);
        const [request] = await sql`
          update private.access_requests
          set status = 'rejected', reviewed_at = now()
          where id = ${body.id} and status = 'pending'
          returning id, email, org_name`;
        if (!request) return json({ ok: false, message: "That request was already handled." }, 409);
        return json({ ok: true, email: request.email, orgName: request.org_name });
      }

      default:
        return json({ ok: false, message: "Unknown action." }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, message: "Something went wrong." }, 500);
  }
});
