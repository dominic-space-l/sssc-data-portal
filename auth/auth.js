// auth.js: the functions the website's buttons call.
//
// Written as a module so it can move into the Angular app later:
//   - Prototype: supabase-js loads from a CDN (the import below).
//   - Angular:   change the import to `import { createClient } from "@supabase/supabase-js";`
//                and call initAuth(environment.supabase) once, e.g. in a service constructor.
//
// Every function returns { ok: true, ... } or { ok: false, message }.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let client = null;

/** Call once per page (or once in an Angular service) before anything else. */
export function initAuth(config) {
  client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  return client;
}

function db() {
  if (!client) throw new Error("Call initAuth(config) first");
  return client;
}

const fail = (error) => ({ ok: false, message: error.message ?? String(error) });

// ---------------------------------------------------------------------------
// Day 1: connection checks
// ---------------------------------------------------------------------------

export async function testConnection(table) {
  const { data, error } = await db().from(table).select("*").limit(1);
  if (error) return fail(error);
  return { ok: true, rows: data.length };
}

export async function sendTestEmail() {
  const { data, error } = await db().functions.invoke("send-test-email", {
    body: { note: "Test from the prototype site" },
  });
  if (error) return fail(error);
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Day 2: admin login
// ---------------------------------------------------------------------------

export async function login(email, password) {
  const { data, error } = await db().auth.signInWithPassword({ email, password });
  if (error) return fail(error);
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

export async function logout() {
  const { error } = await db().auth.signOut();
  if (error) return fail(error);
  return { ok: true };
}

/** The logged-in user ({ id, email }) or null. Checks with Supabase, not just the browser. */
export async function getUser() {
  const { data, error } = await db().auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

/** Runs callback(user | null) whenever someone logs in or out. Returns an unsubscribe function. */
export function onAuthChange(callback) {
  const { data } = db().auth.onAuthStateChange((_event, session) => {
    callback(session?.user ? { id: session.user.id, email: session.user.email } : null);
  });
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Day 2: admin submits directly (saved straight to the real table)
// ---------------------------------------------------------------------------

/** rows: one object ({ column: value }) or an array of them. */
export async function submitForm(table, rows) {
  const { data, error } = await db().from(table).insert(rows).select();
  if (error) return fail(error);
  return { ok: true, saved: data.length };
}

// ---------------------------------------------------------------------------
// Day 2: security checks (used by the prototype's Checks panel)
// ---------------------------------------------------------------------------

/** Passes if Supabase refuses new sign-ups. */
export async function checkSignupBlocked() {
  const email = `signup-check-${Date.now()}@gmail.com`;
  const { error } = await db().auth.signUp({ email, password: crypto.randomUUID() });
  if (error && /not allowed|disabled/i.test(error.message)) {
    return { ok: true, message: `Blocked as expected: ${error.message}` };
  }
  if (error) {
    return { ok: false, message: `Unclear result: ${error.message}. Check that "Allow new users to sign up" is off.` };
  }
  return {
    ok: false,
    message: `Sign-up worked, so it is NOT blocked. Turn off "Allow new users to sign up", then delete ${email} in Authentication -> Users.`,
  };
}

/** Passes if the browser cannot reach the private schema. */
export async function checkPrivateHidden() {
  const { error } = await db().schema("private").from("access_requests").select("id").limit(1);
  if (error) return { ok: true, message: `Hidden as expected: ${error.message}` };
  return { ok: false, message: "The private schema is reachable from the browser. Remove it from Exposed schemas in the Data API settings." };
}

/** Passes if a logged-out visitor cannot add rows. Run it while logged out. */
export async function checkLoggedOutBlocked(table) {
  if (await getUser()) return { ok: false, message: "You are logged in. Log out first, then run this check." };
  const { error } = await db().from(table).insert({});
  if (error && /row-level security|permission denied/i.test(error.message)) {
    return { ok: true, message: `Blocked as expected: ${error.message}` };
  }
  if (error) return { ok: false, message: `Got past the security rules (failed later instead): ${error.message}` };
  return { ok: false, message: "A logged-out visitor added a row. The security rules are not working." };
}
