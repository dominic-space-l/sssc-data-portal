// Website settings. These values are safe to be public (they are visible in the browser anyway).
// Fill them in from your TEST Supabase project; swap to the real project at launch.
// Never put a secret key, database password or the Resend key here.

export const SETTINGS = {
  /** Project Settings -> Data API (or Connect -> Framework). */
  supabaseUrl: 'https://hehharhdxezekqongisc.supabase.co',
  /** Project Settings -> API Keys. Starts with sb_publishable_ */
  supabasePublishableKey: 'sb_publishable_UycXMxK1xdrMYxW6X533_A_-AJVWIX8',
  /** Cloudflare's test key (the bot check always passes). Swap in the real site key before launch. */
  turnstileSiteKey: '1x00000000000000000000AA',
  /** Shown to outside organizations as "Questions? Contact ..." */
  contactEmail: 'you@example.com',
};
