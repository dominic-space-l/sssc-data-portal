// Email alerts through Resend. All alerts go to one inbox: the NOTIFY_EMAIL secret.
// Changing who gets alerts = changing that one secret.

import { requireEnv } from "./http.ts";

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Sends one alert email. Returns true if Resend accepted it. Never throws. */
export async function sendAlert(subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      },
      body: JSON.stringify({
        from: "Data Portal <onboarding@resend.dev>",
        to: [requireEnv("NOTIFY_EMAIL")],
        subject,
        html,
      }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("Resend request failed", err);
    return false;
  }
}
