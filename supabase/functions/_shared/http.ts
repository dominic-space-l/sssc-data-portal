// Shared HTTP helpers for all Edge Functions.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Handles the browser's CORS pre-check and rejects anything that isn't POST. */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Use POST" }, 405);
  return null;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

/** Website base URL without a trailing slash, e.g. https://my-site.onrender.com */
export function siteUrl(): string {
  return requireEnv("SITE_URL").replace(/\/+$/, "");
}

/**
 * Page addresses inside the website. The plain prototype uses /admin.html and /submit.html;
 * the Angular site uses /admin and /submit. Set ADMIN_PATH and SUBMIT_PATH secrets to switch.
 */
export function adminPageUrl(): string {
  return siteUrl() + (Deno.env.get("ADMIN_PATH") ?? "/admin.html");
}

export function submitPageUrl(code: string): string {
  return `${siteUrl()}${Deno.env.get("SUBMIT_PATH") ?? "/submit.html"}?code=${code}`;
}
