// PUBLIC function: an outside organization uses its one-time link.
// Deploy with --no-verify-jwt (link users aren't logged in).
//
// Actions (send { "action": "...", ... } in the body):
//   check  { code }                  -> is the link usable? (the submit page calls this when it opens)
//   lookup { code, table }           -> rows of a dropdown list (tables in the LOOKUP_TABLES secret)
//   submit { code, parts }           -> checks everything, holds it as pending, uses up the link, emails the admin
//            (or the older { code, table, rows } for a single table)
//
// Nothing reaches the real tables here. That only happens when the admin approves.
// Secrets used: ALLOWED_TABLES, LOOKUP_TABLES, RESEND_API_KEY, NOTIFY_EMAIL, SITE_URL

import { json, preflight, readJson, siteUrl } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { escapeHtml, sendAlert } from "../_shared/email.ts";
import { checkLink } from "../_shared/links.ts";
import { dryRun, normalizeParts, readLookup, rowCount, RowError } from "../_shared/rows.ts";

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
      return json({ ok: true, orgName: link.orgName, expiresAt: link.expiresAt });
    }

    if (body.action === "lookup") {
      return json({ ok: true, rows: await readLookup(sql, body.table) });
    }

    if (body.action !== "submit") return json({ ok: false, message: "Unknown action." }, 400);

    // 1. Check the tables, the rows and the placeholders.
    const parts = normalizeParts(body);
    const rows = rowCount(parts);

    // 2. Try saving for real, then undo it. Catches bad data now, while the person is still here.
    const problem = await dryRun(sql, parts);
    if (problem) return json({ ok: false, message: problem }, 400);

    // 3. Use up the link and hold the submission as pending, together or not at all.
    const saved = await sql.begin(async (tx: typeof sql) => {
      const [used] = await tx`
        update private.access_links set used_at = now()
        where id = ${link.id} and used_at is null and revoked_at is null and expires_at > now()
        returning id`;
      if (!used) return false;
      await tx`
        insert into private.pending_submissions (link_id, parts, row_count)
        values (${link.id}, ${tx.json(parts)}, ${rows})`;
      return true;
    });
    if (!saved) return json({ ok: false, message: LINK_MESSAGES.used }, 409);

    // 4. Tell the admin. No submitted data goes in the email.
    const org = link.orgName ?? "an outside organization";
    await sendAlert(
      `New submission waiting: ${org}`,
      `<p>A new submission is waiting for review.</p>
       <p><strong>From:</strong> ${escapeHtml(org)}<br/><strong>Rows:</strong> ${rows}</p>
       <p><a href="${siteUrl()}/admin.html">Open the admin dashboard</a> to approve or reject it.</p>`,
    );

    return json({ ok: true, rows });
  } catch (err) {
    if (err instanceof RowError) return json({ ok: false, message: err.message }, 400);
    console.error(err);
    return json({ ok: false, message: "Something went wrong. Please try again later." }, 500);
  }
});
