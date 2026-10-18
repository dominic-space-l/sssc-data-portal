// Day 1 test: sends one email through Resend to your own inbox.
// Secrets it reads (set with `npx supabase secrets set ...`):
//   RESEND_API_KEY  - from resend.com -> API Keys
//   NOTIFY_EMAIL    - the email you signed up to Resend with
// Delete this function after Day 1; the real alert function replaces it on Day 3.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("NOTIFY_EMAIL");
  if (!apiKey || !to) return json({ error: "RESEND_API_KEY or NOTIFY_EMAIL secret is missing" }, 500);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: "Data Portal <onboarding@resend.dev>",
      to: [to],
      subject: "Data Portal test alert",
      html: "<p>If you can read this, the website can send email alerts.</p>",
    }),
  });

  const result = await res.json();
  return json(result, res.ok ? 200 : res.status);
});
