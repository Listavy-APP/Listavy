// RLS and privilege-guard tests for supabase/migrations/0001_init.sql.
// Runs the migration in an in-memory Postgres (PGlite) with a stub auth schema.
// Usage: npm run test:rls   (all data is TEST data)
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(here, "../migrations/0001_init.sql"), "utf8");

const HOMEOWNER = "00000000-0000-0000-0000-000000000001";
const PRO = "00000000-0000-0000-0000-000000000002";
const ADMIN = "00000000-0000-0000-0000-000000000003";
const OUTSIDER_PRO = "00000000-0000-0000-0000-000000000004";
const JOB = "10000000-0000-0000-0000-000000000001";

const db = new PGlite();

// Stand-in for Supabase's auth schema and roles.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, phone text);
  create role authenticated;
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to public;
`);
await db.exec(migration);
await db.exec(
  `grant usage on schema public to authenticated;
   grant all on all tables in schema public to authenticated;
   grant execute on all functions in schema public to authenticated;`,
);

// Seed as the SQL editor would (no auth.uid), so the trigger creates profiles.
await db.exec(`
  insert into auth.users (id, phone) values
    ('${HOMEOWNER}', '+18095550001'),
    ('${PRO}', '+18095550002'),
    ('${ADMIN}', '+18095550003'),
    ('${OUTSIDER_PRO}', '+18095550004');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  update public.profiles set role = 'pro' where id in ('${PRO}', '${OUTSIDER_PRO}');
  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status)
    values ('${PRO}', 'plumber', 'Piantini', 2000, 4000, 'pending'),
           ('${OUTSIDER_PRO}', 'electrician', 'Naco', 2000, 4000, 'approved');
  insert into public.jobs (id, homeowner_id, trade, zone, description)
    values ('${JOB}', '${HOMEOWNER}', 'plumber', 'Piantini', 'TEST: fuga en baño');
  insert into public.quotes (job_id, pro_id, amount_dop)
    values ('${JOB}', '${PRO}', 3000);
`);

/** Runs a query as a given user and returns rows. Resets role afterwards. */
async function asUser(uid, sql) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", `${name}: ${e.message.split("\n")[0]}`]);
  }
}

await check("pro cannot self-verify", async () => {
  await assert.rejects(
    asUser(PRO, `update public.pros set verification_status = 'approved' where id = '${PRO}'`),
    /Solo un administrador/,
  );
});

await check("pro cannot self-upgrade plan", async () => {
  await assert.rejects(
    asUser(PRO, `update public.pros set plan = 'pro' where id = '${PRO}'`),
    /Solo un administrador/,
  );
});

await check("user cannot change own role", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `update public.profiles set role = 'admin' where id = '${HOMEOWNER}'`),
    /Solo un administrador/,
  );
});

await check("admin can verify a pro", async () => {
  await asUser(ADMIN, `update public.pros set verification_status = 'approved' where id = '${PRO}'`);
  const r = await asUser(ADMIN, `select verification_status from public.pros where id = '${PRO}'`);
  assert.equal(r.rows[0].verification_status, "approved");
});

await check("quoting pro reads job without RLS recursion", async () => {
  const r = await asUser(PRO, "select id from public.jobs");
  assert.equal(r.rows.length, 1);
});

await check("homeowner reads own job", async () => {
  const r = await asUser(HOMEOWNER, "select id from public.jobs");
  assert.equal(r.rows.length, 1);
});

await check("unrelated pro cannot read the job", async () => {
  const r = await asUser(OUTSIDER_PRO, "select id from public.jobs");
  assert.equal(r.rows.length, 0);
});

await check("client cannot insert payments", async () => {
  await assert.rejects(
    asUser(
      HOMEOWNER,
      `insert into public.payments (job_id, currency, amount_minor, fx_rate_dop_per_usd)
       values ('${JOB}', 'USD', 5000, 60)`,
    ),
    /permission denied|row-level security/,
  );
});

await check("only approved pros visible to homeowners", async () => {
  // PRO was approved by the admin test above, so both seeded pros are approved.
  // Pending pros must stay hidden; add one and check it is not listed.
  const pending = "00000000-0000-0000-0000-000000000005";
  await db.exec(`insert into auth.users (id, phone) values ('${pending}', '+18095550005')`);
  await db.exec(`update public.profiles set role = 'pro' where id = '${pending}'`);
  await db.exec(
    `insert into public.pros (id, trade, zone, price_min_dop, price_max_dop)
     values ('${pending}', 'ac_technician', 'Gazcue', 2000, 4000)`,
  );
  const r = await asUser(HOMEOWNER, "select id from public.pros");
  assert.equal(r.rows.some((row) => row.id === pending), false);
  assert.equal(r.rows.length, 2);
});

await check("job FX rate must be positive", async () => {
  await assert.rejects(
    asUser(
      HOMEOWNER,
      `insert into public.jobs (homeowner_id, trade, zone, description, fx_rate_dop_per_usd)
       values ('${HOMEOWNER}', 'plumber', 'Naco', 'TEST: x', 0)`,
    ),
    /check constraint/,
  );
});

await db.close();

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
