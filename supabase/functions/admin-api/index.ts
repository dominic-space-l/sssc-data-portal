// ADMIN-ONLY function: everything the admin dashboard does behind the scenes.
// verify_jwt is off in supabase/config.toml: this code checks the caller itself, and only
// signed-in users listed in auth_private.admins get through (see _shared/auth.ts).
//
// Actions (send { "action": "...", ... } in the body):
//   list_requests                          -> pending access requests
//   approve_request    { id, organizationId? } -> marks approved, creates a link, returns it.
//                                             With organizationId: an UPDATE link for that organization
//                                             (required when the request asked to update existing data)
//   create_edit_link   { organizationId }  -> an update link without a request (e.g. the organization emailed)
//   reject_request     { id }              -> marks rejected
//   list_submissions                       -> outside submissions waiting for review
//   approve_submission { id }              -> new data: saves every part (all or none)
//                                             edit: applies the changes, unless the data changed meanwhile
//   reject_submission  { id, newLink }     -> discards it; newLink: true also creates a fresh link
//   form_options                           -> dropdown lists for the forms
//   submit_form        { form, fields }    -> the admin fills in a form (main, organization, project,
//                                             station, device): checked, built, saved straight away
//
// Secrets used: SITE_URL, LINK_DAYS (optional, default 7)

import { json, preflight, readJson } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { getAdmin } from "../_shared/auth.ts";
import { createLink } from "../_shared/links.ts";
import { friendlyDbError, insertParts, normalizeParts, RowError } from "../_shared/rows.ts";
import { ADMIN_FORMS, buildForm, FieldError, formOptions, isForm } from "../_shared/forms.ts";
import { applyChanges, EditConflict, readChanges } from "../_shared/edits.ts";

const orgIdOrNull = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isInteger(n) && n > 0 ? n : null;
};

// deno-lint-ignore no-explicit-any
async function organizationName(sql: any, id: number | null): Promise<string | null> {
  if (id === null) return null;
  const [org] = await sql`select "OrganizationName" as name from "Organizations" where "OrganizationID" = ${id}`;
  return org ? org.name : null;
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

class Conflict extends Error {}
class NeedsOrg extends Error {}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const sql = db();
    const caller = await getAdmin(req, sql);
    if (!caller) return json({ ok: false, message: "Please log in with an admin account." }, 401);

    const body = await readJson(req);
    const needsId = ["approve_request", "reject_request", "approve_submission", "reject_submission"];
    if (needsId.includes(String(body.action)) && !isUuid(body.id)) {
      return json({ ok: false, message: "Missing or invalid id." }, 400);
    }

    switch (body.action) {
      // ---------------- Access requests (Day 3) ----------------
      case "list_requests": {
        const requests = await sql`
          select id, org_name, contact_name, email, reason, created_at, kind
          from auth_private.access_requests
          where status = 'pending'
          order by created_at`;
        return json({ ok: true, requests });
      }

      case "approve_request": {
        const organizationId = orgIdOrNull(body.organizationId);
        const orgName = await organizationName(sql, organizationId);
        if (organizationId !== null && !orgName) return json({ ok: false, message: "That organization doesn't exist." }, 400);
        const result = await sql.begin(async (tx: typeof sql) => {
          const [request] = await tx`
            update auth_private.access_requests
            set status = 'approved', reviewed_at = now()
            where id = ${body.id as string} and status = 'pending'
            returning id, org_name, email, kind`;
          if (!request) return { error: "That request was already handled.", status: 409 };
          if (request.kind === "edit" && organizationId === null) {
            throw new NeedsOrg();
          }
          const link = organizationId === null
            ? await createLink(tx, request.id)
            : await createLink(tx, request.id, { kind: "edit", organizationId });
          return { request, ...link };
        }).catch((err: unknown) => {
          if (err instanceof NeedsOrg) return { error: "This organization wants to update existing data. Pick which organization it is first.", status: 400 };
          throw err;
        });
        if ("error" in result) return json({ ok: false, message: result.error }, result.status);
        return json({
          ok: true,
          email: result.request.email,
          orgName: orgName ?? result.request.org_name,
          kind: result.kind,
          link: result.link,
          expiresAt: result.expiresAt,
        });
      }

      case "create_edit_link": {
        const organizationId = orgIdOrNull(body.organizationId);
        const orgName = await organizationName(sql, organizationId);
        if (!orgName) return json({ ok: false, message: "Pick an organization." }, 400);
        const link = await createLink(sql, null, { kind: "edit", organizationId });
        return json({ ok: true, email: null, orgName, ...link });
      }

      case "reject_request": {
        const [request] = await sql`
          update auth_private.access_requests
          set status = 'rejected', reviewed_at = now()
          where id = ${body.id as string} and status = 'pending'
          returning id, email, org_name`;
        if (!request) return json({ ok: false, message: "That request was already handled." }, 409);
        return json({ ok: true, email: request.email, orgName: request.org_name });
      }

      // ---------------- Outside submissions (Day 4) ----------------
      case "list_submissions": {
        const submissions = await sql`
          select s.id, s.parts, s.row_count, s.submitted_at, s.form, s.kind, s.changes,
                 coalesce(o."OrganizationName", r.org_name) as org_name, r.contact_name, r.email
          from auth_private.pending_submissions s
          left join auth_private.access_links l on l.id = s.link_id
          left join auth_private.access_requests r on r.id = l.request_id
          left join public."Organizations" o on o."OrganizationID" = l.organization_id
          where s.status = 'pending'
          order by s.submitted_at`;
        return json({ ok: true, submissions });
      }

      case "approve_submission": {
        try {
          const saved = await sql.begin(async (tx: typeof sql) => {
            const [submission] = await tx`
              select id, parts, form, kind, changes from auth_private.pending_submissions
              where id = ${body.id as string} and status = 'pending'
              for update`;
            if (!submission) throw new Conflict();
            let count: number;
            if (submission.kind === "edit") {
              // Edits: apply each change, stopping if the data changed since it was sent.
              count = await applyChanges(tx, readChanges(submission.changes));
            } else {
              // Every submission was built by the server's own form builders, so it may write to
              // any of its form's tables. Each part is saved in order.
              const parts = normalizeParts({ parts: submission.parts });
              count = await insertParts(tx, parts);
            }
            await tx`
              update auth_private.pending_submissions
              set status = 'approved', reviewed_at = now()
              where id = ${submission.id}`;
            return count;
          });
          return json({ ok: true, saved });
        } catch (err) {
          if (err instanceof Conflict) return json({ ok: false, message: "That submission was already handled." }, 409);
          if (err instanceof EditConflict) return json({ ok: false, message: err.message }, 409);
          if (err instanceof RowError) return json({ ok: false, message: err.message }, 400);
          return json({ ok: false, message: friendlyDbError(err) }, 400);
        }
      }

      case "reject_submission": {
        const result = await sql.begin(async (tx: typeof sql) => {
          const [submission] = await tx`
            update auth_private.pending_submissions
            set status = 'rejected', reviewed_at = now(), review_note = ${body.newLink ? "rejected, new link sent" : "rejected"}
            where id = ${body.id as string} and status = 'pending'
            returning link_id`;
          if (!submission) return null;
          const [request] = await tx`
            select r.id, r.email, coalesce(o."OrganizationName", r.org_name) as org_name,
                   l.kind, l.organization_id
            from auth_private.access_links l
            left join auth_private.access_requests r on r.id = l.request_id
            left join public."Organizations" o on o."OrganizationID" = l.organization_id
            where l.id = ${submission.link_id}`;
          // The new link is the same kind as the old one (an update link stays an update link).
          const fresh = body.newLink
            ? await createLink(tx, request?.id ?? null, {
              kind: request?.kind === "edit" ? "edit" : "new",
              organizationId: request?.organization_id === null || request?.organization_id === undefined ? null : Number(request.organization_id),
            })
            : null;
          return { email: request?.email ?? null, orgName: request?.org_name ?? null, ...(fresh ?? {}) };
        });
        if (!result) return json({ ok: false, message: "That submission was already handled." }, 409);
        return json({ ok: true, ...result });
      }

      case "form_options":
        return json({ ok: true, options: await formOptions(sql) });

      case "submit_form": {
        if (!isForm(body.form) || !ADMIN_FORMS.includes(body.form)) {
          return json({ ok: false, message: "Unknown form." }, 400);
        }
        try {
          const parts = normalizeParts({ parts: await buildForm(sql, body.form, body.fields) });
          const saved = await sql.begin((tx: typeof sql) => insertParts(tx, parts));
          return json({ ok: true, saved });
        } catch (err) {
          if (err instanceof FieldError) return json({ ok: false, field: err.field, message: err.message }, 400);
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
