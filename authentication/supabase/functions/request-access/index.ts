// PUBLIC function: an outside organization asks for access.
// Deploy with --no-verify-jwt (visitors aren't logged in).
//
// Steps: check the bot test -> check the fields -> save to private.access_requests -> email the admin.
// Secrets used: TURNSTILE_SECRET_KEY, RESEND_API_KEY, NOTIFY_EMAIL, SITE_URL

import { json, preflight, readJson, requireEnv, siteUrl } from "../_shared/http.ts";
import { db } from "../_shared/db.ts";
import { escapeHtml, sendAlert } from "../_shared/email.ts";

const MAX_PENDING_PER_EMAIL = 3; // per 24 hours, so one address can't flood the queue

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function passedBotCheck(token: string, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", requireEnv("TURNSTILE_SECRET_KEY"));
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const result = await res.json();
  return result.success === true;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const body = await readJson(req);
    const orgName = text(body.orgName, 200);
    const contactName = text(body.contactName, 200);
    const email = text(body.email, 320).toLowerCase();
    const reason = text(body.reason, 2000);
    const token = text(body.turnstileToken, 4096);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    if (!(await passedBotCheck(token, ip))) {
      return json({ ok: false, message: "Bot check failed. Please try again." }, 400);
    }

    if (!orgName || !email) {
      return json({ ok: false, message: "Organization name and email are required." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, message: "That email address doesn't look right." }, 400);
    }

    const sql = db();
    const [{ count }] = await sql`
      select count(*)::int as count from private.access_requests
      where email = ${email} and status = 'pending' and created_at > now() - interval '24 hours'`;
    if (count >= MAX_PENDING_PER_EMAIL) {
      return json({ ok: false, message: "You already have requests waiting. Please wait for a reply." }, 429);
    }

    await sql`
      insert into private.access_requests (org_name, contact_name, email, reason)
      values (${orgName}, ${contactName || null}, ${email}, ${reason || null})`;

    const dashboard = `${siteUrl()}/admin.html`;
    await sendAlert(
      `New access request: ${orgName}`,
      `<p>A new access request is waiting for review.</p>
       <p><strong>Organization:</strong> ${escapeHtml(orgName)}</p>
       <p><a href="${dashboard}">Open the admin dashboard</a> to approve or reject it.</p>`,
    );

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, message: "Something went wrong. Please try again later." }, 500);
  }
});
