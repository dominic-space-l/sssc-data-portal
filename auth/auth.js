// auth.js: every behind-the-scenes action the website's buttons call.
// Day 1 only has the connection check and the test email. Login, submissions,
// links and approvals get added on later days.
(function () {
  const cfg = window.APP_CONFIG;
  if (!cfg || !window.supabase) {
    console.error("Load config.js and supabase-js before auth.js");
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);

  // Day 1: can the website talk to the test database?
  async function testConnection() {
    const { data, error } = await client.from(cfg.TEST_TABLE).select("*").limit(1);
    if (error) return { ok: false, message: error.message };
    return { ok: true, rows: data.length };
  }

  // Day 1: can the website trigger an email through the Edge Function + Resend?
  async function sendTestEmail() {
    const { data, error } = await client.functions.invoke("send-test-email", {
      body: { note: "Day 1 test from the prototype site" },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data };
  }

  window.Auth = { client, testConnection, sendTestEmail };
})();
