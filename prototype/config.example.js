// Copy the two NEW lines below into your own prototype/config.js (keep your existing values).
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-TEST-PROJECT-REF.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_REPLACE_ME",
  TEST_TABLE: "Organizations",
  FORM_TABLE: "Sensors",

  // NEW (Day 3)
  // Cloudflare's official test key: the bot check always passes. Swap in a real key before launch.
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  // Shown on the Request Access page. Change it any time.
  CONTACT_EMAIL: "you@example.com",
};
