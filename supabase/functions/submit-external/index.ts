// PUBLIC function: an outside organization uses its link.
// verify_jwt is off in supabase/config.toml (link users aren't signed in); the link code is the key.
//
// Two kinds of link (see _shared/links.ts):
//   new  - add new data, works once
//   edit - update the organization's existing data, works until it expires (every edit is reviewed)
//
// Actions (send { "action": "...", ... } in the body):
//   check  { code }                  -> is the link usable? kind, organization, forms
//   form_options { code }            -> dropdown lists for the forms (IDs and names only)
//   submit_form  { code, form, fields } -> a form (outside organizations: the single "main" form by
//                                       default): checked, turned into rows by its builder, held as
//                                       pending, admin emailed
//   Update links only:
//   my_records { code }                       -> the organization's stations (owner/maintainer) and contacts
//   station_details { code, stationId }       -> current values, contacts, devices, sensors of one station
//   submit_edit { code, edit, target, fields } -> an edit (station/station_contact/contact/device/sensor),
//                                               held with its before/after values until the admin approves
//
// Nothing reaches the real tables here. That only happens when the admin approves.
// Secrets used: LINK_FORMS (optional), RESEND_API_KEY, NOTIFY_EMAIL, SITE_URL, ADMIN_PATH

import { adminPageUrl, json, preflight, readJson } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { escapeHtml, sendAlert } from "../_shared/email.ts";
import { checkLink } from "../_shared/links.ts";
import { dryRun, normalizeParts, rowCount, RowError } from "../_shared/rows.ts";
import { buildForm, FieldError, formOptions, linkForms } from "../_shared/forms.ts";
import { buildEdit, dryRunChanges, recordsFor, stationDetails } from "../_shared/edits.ts";

const MAX_PENDING_EDITS_PER_LINK = 30;

const LINK_MESSAGES = {
  invalid: "This link isn't valid. Check that you copied the whole link.",
  used: "This link has already been used. Each link works once. Ask for a new one if you need to submit again.",
  expired: "This link has expired. Ask for a new one.",
  revoked: "This link has been cancelled. Ask for a new one.",
};

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const body = await readJson(req);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const sql = db();

    const link = await checkLink(sql, code);
    if (link.state !== "valid") {
      return json({ ok: false, linkState: link.state, message: LINK_MESSAGES[link.state] }, 400);
    }

    if (body.action === "check") {
      return json({ ok: true, kind: link.kind, orgName: link.orgName, expiresAt: link.expiresAt, forms: linkForms() });
    }

    // ---------------- Update links ----------------
    if (["my_records", "station_details", "submit_edit"].includes(String(body.action))) {
      if (link.kind !== "edit" || link.organizationId === null) {
        return json({ ok: false, message: "This link is for adding new data only. Ask for an update link to change existing data." }, 400);
      }
      const orgId = link.organizationId;

      if (body.action === "my_records") return json({ ok: true, ...(await recordsFor(sql, orgId)) });

      if (body.action === "station_details") {
        return json({ ok: true, ...(await stationDetails(sql, orgId, Number(body.stationId) || null)) });
      }

      // submit_edit
      const [{ count }] = await sql`
        select count(*)::int as count from auth_private.pending_submissions
        where link_id = ${link.id} and status = 'pending'`;
      if (count >= MAX_PENDING_EDITS_PER_LINK) {
        return json({ ok: false, message: "You have a lot of edits waiting for review. Please wait for the admin to go through them." }, 429);
      }
      const changes = await buildEdit(sql, orgId, body.edit, body.target, body.fields);
      const problem = await dryRunChanges(sql, changes);
      if (problem) return json({ ok: false, message: problem }, 400);
      await sql`
        insert into auth_private.pending_submissions (link_id, parts, row_count, form, kind, changes)
        values (${link.id}, ${sql.json([])}, ${changes.length}, ${String(body.edit)}, 'edit', ${sql.json(changes as never)})`;
      const org = link.orgName ?? "an outside organization";
      await sendAlert(
        `Edit waiting for review: ${org}`,
        `<p>An organization sent changes to its existing data.</p>
         <p><strong>From:</strong> ${escapeHtml(org)}<br/><strong>Changes:</strong> ${escapeHtml(changes.map((c) => c.label).join("; "))}</p>
         <p><a href="${adminPageUrl()}">Open the admin dashboard</a> to approve or reject it.</p>`,
      );
      return json({ ok: true, changes: changes.length });
    }

    if (body.action === "form_options") {
      return json({ ok: true, options: await formOptions(sql) });
    }

    if (body.action !== "submit_form") {
      return json({ ok: false, message: "Unknown action." }, 400);
    }

    // 1. The form's builder checks the fields and turns them into rows. Only forms open to
    //    outside organizations are accepted, and only the builders' own tables are written.
    if (!linkForms().includes(body.form as never)) {
      return json({ ok: false, message: "That form isn't open for submissions." }, 400);
    }
    const form = body.form as string;
    const parts = normalizeParts({ parts: await buildForm(sql, body.form, body.fields) });
    const rows = rowCount(parts);

    // 2. Try saving for real, then undo it. Catches bad data now, while the person is still here.
    const problem = await dryRun(sql, parts);
    if (problem) return json({ ok: false, message: problem }, 400);

    // 3. Hold the submission as pending. A "new" link is used up at the same time (together or not at all);
    //    an update link stays usable until it expires.
    const saved = await sql.begin(async (tx: typeof sql) => {
      const [used] = await tx`
        update auth_private.access_links set used_at = case when kind = 'new' then now() else null end
        where id = ${link.id} and used_at is null and revoked_at is null and expires_at > now()
        returning id`;
      if (!used) return false;
      await tx`
        insert into auth_private.pending_submissions (link_id, parts, row_count, form)
        values (${link.id}, ${tx.json(parts)}, ${rows}, ${form})`;
      return true;
    });
    if (!saved) return json({ ok: false, message: LINK_MESSAGES.used }, 409);

    // 4. Tell the admin. No submitted data goes in the email.
    const org = link.orgName ?? "an outside organization";
    await sendAlert(
      `New submission waiting: ${org}`,
      `<p>A new submission is waiting for review.</p>
       <p><strong>From:</strong> ${escapeHtml(org)}<br/><strong>Rows:</strong> ${rows}</p>
       <p><a href="${adminPageUrl()}">Open the admin dashboard</a> to approve or reject it.</p>`,
    );

    return json({ ok: true, rows });
  } catch (err) {
    if (err instanceof FieldError) return json({ ok: false, field: err.field, message: err.message }, 400);
    if (err instanceof RowError) return json({ ok: false, message: err.message }, 400);
    console.error(err);
    return json({ ok: false, message: "Something went wrong. Please try again later." }, 500);
  }
});
