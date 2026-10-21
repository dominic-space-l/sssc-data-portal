// ADMIN-ONLY function: everything the admin dashboard does behind the scenes.
// Deploy normally (JWT verification ON). It also double-checks the caller is logged in.
//
// Actions (send { "action": "...", ... } in the body):
//   list_requests                          -> pending access requests
//   approve_request    { id }              -> marks approved, creates a one-time link, returns it
//   reject_request     { id }              -> marks rejected
//   list_submissions                       -> outside submissions waiting for review
//   approve_submission { id }              -> saves every part into the real tables (all or none)
//   reject_submission  { id, newLink }     -> discards it; newLink: true also creates a fresh link
//   submit_direct      { parts }           -> the admin's own multi-table entry, saved straight away (all or none)
//
// Secrets used: SITE_URL, ALLOWED_TABLES, LINK_DAYS (optional, default 7)

import { json, preflight, readJson } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { getCaller } from "../_shared/auth.ts";
import { createLink } from "../_shared/links.ts";
import { friendlyDbError, insertParts, normalizeParts, RowError } from "../_shared/rows.ts";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

class Conflict extends Error {}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const caller = await getCaller(req);
  if (!caller) return json({ ok: false, message: "Please log in." }, 401);

  try {
    const body = await readJson(req);
    const sql = db();
    const needsId = ["approve_request", "reject_request", "approve_submission", "reject_submission"];
    if (needsId.includes(String(body.action)) && !isUuid(body.id)) {
      return json({ ok: false, message: "Missing or invalid id." }, 400);
    }

    switch (body.action) {
      // ---------------- Access requests (Day 3) ----------------
      case "list_requests": {
        const requests = await sql`
          select id, org_name, contact_name, email, reason, created_at
          from private.access_requests
          where status = 'pending'
          order by created_at`;
        return json({ ok: true, requests });
      }

      case "approve_request": {
        const result = await sql.begin(async (tx: typeof sql) => {
          const [request] = await tx`
            update private.access_requests
            set status = 'approved', reviewed_at = now()
            where id = ${body.id} and status = 'pending'
            returning id, org_name, email`;
          if (!request) return null;
          const link = await createLink(tx, request.id);
          return { request, ...link };
        });
        if (!result) return json({ ok: false, message: "That request was already handled." }, 409);
        return json({
          ok: true,
          email: result.request.email,
          orgName: result.request.org_name,
          link: result.link,
          expiresAt: result.expiresAt,
        });
      }

      case "reject_request": {
        const [request] = await sql`
          update private.access_requests
          set status = 'rejected', reviewed_at = now()
          where id = ${body.id} and status = 'pending'
          returning id, email, org_name`;
        if (!request) return json({ ok: false, message: "That request was already handled." }, 409);
        return json({ ok: true, email: request.email, orgName: request.org_name });
      }

      // ---------------- Outside submissions (Day 4) ----------------
      case "list_submissions": {
        const submissions = await sql`
          select s.id, s.parts, s.row_count, s.submitted_at,
                 r.org_name, r.contact_name, r.email
          from private.pending_submissions s
          left join private.access_links l on l.id = s.link_id
          left join private.access_requests r on r.id = l.request_id
          where s.status = 'pending'
          order by s.submitted_at`;
        return json({ ok: true, submissions });
      }

      case "approve_submission": {
        try {
          const saved = await sql.begin(async (tx: typeof sql) => {
            const [submission] = await tx`
              select id, parts from private.pending_submissions
              where id = ${body.id} and status = 'pending'
              for update`;
            if (!submission) throw new Conflict();
            // Re-check against today's ALLOWED_TABLES, then save every part in order.
            const parts = normalizeParts({ parts: submission.parts });
            const count = await insertParts(tx, parts);
            await tx`
              update private.pending_submissions
              set status = 'approved', reviewed_at = now()
              where id = ${submission.id}`;
            return count;
          });
          return json({ ok: true, saved });
        } catch (err) {
          if (err instanceof Conflict) return json({ ok: false, message: "That submission was already handled." }, 409);
          if (err instanceof RowError) return json({ ok: false, message: err.message }, 400);
          return json({ ok: false, message: friendlyDbError(err) }, 400);
        }
      }

      case "reject_submission": {
        const result = await sql.begin(async (tx: typeof sql) => {
          const [submission] = await tx`
            update private.pending_submissions
            set status = 'rejected', reviewed_at = now(), review_note = ${body.newLink ? "rejected, new link sent" : "rejected"}
            where id = ${body.id} and status = 'pending'
            returning link_id`;
          if (!submission) return null;
          const [request] = await tx`
            select r.id, r.email, r.org_name
            from private.access_links l
            join private.access_requests r on r.id = l.request_id
            where l.id = ${submission.link_id}`;
          const fresh = body.newLink ? await createLink(tx, request?.id ?? null) : null;
          return { email: request?.email ?? null, orgName: request?.org_name ?? null, ...(fresh ?? {}) };
        });
        if (!result) return json({ ok: false, message: "That submission was already handled." }, 409);
        return json({ ok: true, ...result });
      }

      case "submit_direct": {
        try {
          // The admin can write to any table, not just the ones open to outside organizations.
          const parts = normalizeParts(body, { anyTable: true });
          const saved = await sql.begin((tx: typeof sql) => insertParts(tx, parts));
          return json({ ok: true, saved });
        } catch (err) {
          if (err instanceof RowError) return json({ ok: false, message: err.message }, 400);
          return json({ ok: false, message: friendlyDbError(err) }, 400);
        }
      }

      default:
        return json({ ok: false, message: "Unknown action." }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, message: "Something went wrong." }, 500);
  }
});
