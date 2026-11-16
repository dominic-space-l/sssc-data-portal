/**
 * @fileoverview Public settings for the portal. Everything here is visible in the browser anyway.
 *
 * Defaults point at the LOCAL Supabase stack (`npm run db:start` from the repo root). Fill in
 * `supabasePublishableKey` from `npx supabase status -o env` (PUBLISHABLE_KEY). To point the
 * portal at a hosted project, change both values to that project's URL and publishable key.
 *
 * Never put a secret key, database password, Resend key or Turnstile secret here.
 */

export const SETTINGS = {
  /** API_URL from `npx supabase status -o env`, or a hosted project's URL. */
  supabaseUrl: 'https://hehharhdxezekqongisc.supabase.co',
  /** PUBLISHABLE_KEY (starts with sb_publishable_) from `npx supabase status -o env`. */
  supabasePublishableKey: 'sb_publishable_UycXMxK1xdrMYxW6X533_A_-AJVWIX8',
  /** Cloudflare's test site key (the bot check always passes). Swap in SSSC's real key before launch. */
  turnstileSiteKey: '1x00000000000000000000AA',
  /** Shown to outside organizations as "Questions? Contact ...". The client's admin email. */
  contactEmail: 'admin@example.org',
};
