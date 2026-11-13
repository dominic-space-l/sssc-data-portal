// Guards and reports for the workflows that reach the hosted Supabase project.
//
// Role: used by .github/workflows/database-deploy.yml and database-drift.yml. It makes
// sure a command meant for the hosted database never quietly runs against the wrong one
// (since Supabase CLI 3, commands target the local database unless given --remote), and
// it turns the CLI's JSON output into a job summary and a pass/fail result. Every report
// command first checks that the output names a non-local database URL as its target.
//
// Usage (each <file> holds the CLI's JSON stdout from `--output-format json`):
//   node .github/scripts/supabase_ci.mjs check-url <ENV_VAR_NAME>
//       Fails unless that environment variable holds a Postgres URL for the project in
//       $SUPABASE_PROJECT_ID. Never prints the URL or password.
//   node .github/scripts/supabase_ci.mjs plan <file>      db push --dry-run: lists pending
//       migrations and sets the step output pending=true|false.
//   node .github/scripts/supabase_ci.mjs pushed <file>    db push: lists what was applied.
//   node .github/scripts/supabase_ci.mjs history <file>   migration list: fails unless
//       every migration is both local and remote.
//   node .github/scripts/supabase_ci.mjs diff <file>      db diff: fails on any SQL.
//   node .github/scripts/supabase_ci.mjs advisors <file>  db advisors: lists findings,
//       fails on any ERROR-level one.
// Summaries go to $GITHUB_STEP_SUMMARY and outputs to $GITHUB_OUTPUT when set, and to
// stdout otherwise, so every command can be tried locally against saved output.

import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";

const LOCAL_HOST = /^(127\.|localhost$|::1$|\[::1\]$)/;

/** Raised for a failed check. Its message becomes a GitHub Actions error annotation. */
class CheckFailed extends Error {}

/**
 * Appends Markdown to the job summary, or prints it when run outside Actions.
 * @param {string} markdown The text to add.
 */
function summary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) {
    appendFileSync(file, `${markdown}\n`);
  } else {
    console.log(markdown);
  }
}

/**
 * Sets a step output, or prints it when run outside Actions.
 * @param {string} name The output name.
 * @param {string} value The output value.
 */
function output(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    appendFileSync(file, `${name}=${value}\n`);
  } else {
    console.log(`output ${name}=${value}`);
  }
}

/**
 * Checks that an environment variable holds a Postgres URL for $SUPABASE_PROJECT_ID:
 * a pooler URL whose user ends in ".<ref>", or a direct URL to db.<ref>.supabase.co.
 * @param {string} name The environment variable's name (not its value).
 */
function checkUrl(name) {
  const ref = process.env.SUPABASE_PROJECT_ID;
  const value = process.env[name];
  if (!ref) {
    throw new CheckFailed(
      "SUPABASE_PROJECT_ID is not set. Add it as a variable in this job's environment.",
    );
  }
  if (!value) {
    throw new CheckFailed(
      `${name} is empty. Add it as a secret in this job's environment.`,
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CheckFailed(`${name} is not a URL.`);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username ||
    !url.hostname
  ) {
    throw new CheckFailed(
      `${name} is not a postgresql://user:password@host URL.`,
    );
  }
  const user = decodeURIComponent(url.username);
  if (LOCAL_HOST.test(url.hostname)) {
    throw new CheckFailed(
      `${name} points at a local database, not the hosted project.`,
    );
  }
  if (!user.endsWith(`.${ref}`) && url.hostname !== `db.${ref}.supabase.co`) {
    throw new CheckFailed(
      `${name} is not for project ${ref}: expected a pooler user ending in .${ref} ` +
        `or host db.${ref}.supabase.co.`,
    );
  }
  console.log(
    `${name}: user ${user.split(".")[0]} on ${url.hostname}, project ${ref}.`,
  );
}

/**
 * Reads the CLI's JSON output and checks that it targeted a non-local database URL.
 * @param {string} file Path to the saved stdout of a `--output-format json` command.
 * @return {!Object} The parsed output.
 */
function readResult(file) {
  let result;
  try {
    result = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new CheckFailed(
      `Could not read CLI output from ${file}: ${err.message}`,
    );
  }
  const target = result.target;
  if (
    !target ||
    target.kind !== "db-url" ||
    LOCAL_HOST.test(target.host ?? "")
  ) {
    throw new CheckFailed(
      `The CLI did not target the hosted database: ${JSON.stringify(target ?? null)}`,
    );
  }
  return result;
}

/**
 * Formats a list of names as Markdown bullets.
 * @param {!Array<string>} items The names.
 * @return {string} One bullet per line.
 */
function bullets(items) {
  return items.map((item) => `- \`${item}\``).join("\n");
}

/**
 * Reports a `db push --dry-run` and sets the `pending` output.
 * @param {!Object} result The CLI output.
 */
function plan(result) {
  const pending = result.upToDate ? [] : (result.migrations ?? []);
  output("pending", pending.length > 0 ? "true" : "false");
  if (pending.length === 0) {
    summary(
      "### Pending migrations\n\nNothing to deploy: the hosted database is up to date.",
    );
  } else {
    summary(
      `### Pending migrations\n\nApproving the deploy runs these ${pending.length} ` +
        `migration(s) on the hosted database, in order:\n\n${bullets(pending)}`,
    );
  }
}

/**
 * Reports a `db push`.
 * @param {!Object} result The CLI output.
 */
function pushed(result) {
  const applied = result.migrations ?? [];
  summary(
    applied.length === 0
      ? "### Deployed\n\nNothing was applied: the hosted database was already up to date."
      : `### Deployed\n\nApplied to the hosted database:\n\n${bullets(applied)}`,
  );
}

/**
 * Reports a `migration list` and fails unless local and remote history match.
 * @param {!Object} result The CLI output.
 */
function history(result) {
  const migrations = result.migrations ?? [];
  const localOnly = migrations
    .filter((m) => m.local && !m.remote)
    .map((m) => m.local);
  const remoteOnly = migrations
    .filter((m) => m.remote && !m.local)
    .map((m) => m.remote);
  if (localOnly.length === 0 && remoteOnly.length === 0) {
    summary(
      `### Migration history\n\nAll ${migrations.length} migrations are in the ` +
        "repo and on the hosted database.",
    );
    return;
  }
  let text = "### Migration history\n\n";
  if (localOnly.length > 0) {
    text +=
      `**In the repo but not deployed** (merged but never pushed, or waiting for ` +
      `deploy approval):\n\n${bullets(localOnly)}\n\n`;
  }
  if (remoteOnly.length > 0) {
    text +=
      `**On the hosted database but not in the repo** (pushed from outside ` +
      `\`main\`):\n\n${bullets(remoteOnly)}\n\n`;
  }
  summary(text);
  throw new CheckFailed(
    "The migration history differs between the repo and the hosted " +
      "database. See the job summary.",
  );
}

/**
 * Reports a `db diff` and fails if it contains any SQL.
 * @param {!Object} result The CLI output.
 */
function diff(result) {
  const sql = (result.diff ?? "").trim();
  const schemas = (result.schemas ?? []).join(", ");
  if (!sql) {
    summary(
      `### Schema\n\nNo drift in ${schemas}: the hosted schema matches the migrations.`,
    );
    return;
  }
  summary(
    `### Schema\n\nThe hosted schema differs from the migrations in ${schemas}. ` +
      `This SQL would turn the migrations' schema into the hosted one:\n\n` +
      `\`\`\`sql\n${sql}\n\`\`\``,
  );
  throw new CheckFailed(
    "The hosted schema has drifted from the migrations. " +
      "See the job summary.",
  );
}

/**
 * Reports `db advisors` and fails on any ERROR-level finding.
 * @param {!Object} result The CLI output.
 */
function advisors(result) {
  const findings = result.results ?? [];
  if (findings.length === 0) {
    summary("### Security advisors\n\nNo findings.");
    return;
  }
  const rows = findings.map(
    (f) =>
      `| ${f.level} | ${f.title} | ${(f.detail ?? "").replaceAll("|", "\\|")} |`,
  );
  summary(
    "### Security advisors\n\n| Level | Advisor | Detail |\n| --- | --- | --- |\n" +
      rows.join("\n"),
  );
  const errors = findings.filter((f) => f.level === "ERROR").length;
  if (errors > 0) {
    throw new CheckFailed(
      `${errors} ERROR-level security advisor finding(s). ` +
        "See the job summary.",
    );
  }
}

const REPORTS = { plan, pushed, history, diff, advisors };

/**
 * Runs the command named on the command line.
 * @param {!Array<string>} args The arguments after the script name.
 */
function main([command, arg]) {
  if (command === "check-url" && arg) {
    checkUrl(arg);
  } else if (REPORTS[command] && arg) {
    REPORTS[command](readResult(arg));
  } else {
    throw new CheckFailed(
      "usage: supabase_ci.mjs check-url <ENV_VAR_NAME> | " +
        `${Object.keys(REPORTS).join("|")} <file>`,
    );
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof CheckFailed)) throw err;
  console.log(`::error::${err.message}`);
  process.exitCode = 1;
}
