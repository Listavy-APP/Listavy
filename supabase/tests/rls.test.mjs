// RLS, privilege-guard, and storage-policy tests for supabase/migrations/*.sql.
// Runs every migration in order in an in-memory Postgres (PGlite) with stub
// auth and storage schemas. All data is TEST data.
// Usage: npm run test:rls
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "../migrations");
const migrations = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const HOMEOWNER = "00000000-0000-0000-0000-000000000001";
const PRO = "00000000-0000-0000-0000-000000000002";
const ADMIN = "00000000-0000-0000-0000-000000000003";
const OUTSIDER_PRO = "00000000-0000-0000-0000-000000000004";
const PENDING_PRO = "00000000-0000-0000-0000-000000000005";
const COMPANY_PRO = "00000000-0000-0000-0000-000000000006";
const JOB = "10000000-0000-0000-0000-000000000001";

const db = new PGlite();

/**
 * Runs fixture SQL the way the SQL editor does: no user, so role guards allow it (0061).
 * The job suspension trigger (0075) rejects inserts with no auth.uid(); it is disabled only
 * for the fixture and re-enabled in finally. Fixture only.
 */
async function seedFixture(sql) {
  await db.exec("alter table public.jobs disable trigger jobs_block_when_client_suspended");
  try {
    await db.exec(sql);
  } finally {
    await db.exec("alter table public.jobs enable trigger jobs_block_when_client_suspended");
  }
}

// Stand-ins for Supabase's auth and storage schemas.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, phone text);
  create role authenticated;
  create role anon;
  create role service_role;
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  -- Supabase's auth.jwt() returns the request's JWT claims (used by aal2 checks in 0061).
  create or replace function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to public;

  -- Supabase-managed schemas used by migrations. Stubs only; no secrets are stored.
  create schema vault;
  create table vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);
  create schema net;
  create or replace function net.http_post(url text, headers jsonb, body jsonb) returns bigint
    language sql as $$ select 1::bigint $$;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`);

// Production has the launch demo pro before 0059 converts it. Seed it first so 0059's
// demo_reviews inserts pass the foreign key. Fixture only: no migration changes.
const DEMO_PRO = "00000000-0000-4000-8000-000000000001";
async function seedDemoProBeforeMigration(file) {
  if (!file.startsWith("0059_")) return;
  await db.exec(`
    insert into auth.users (id, phone) values ('${DEMO_PRO}', '+18095550099');
    insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status)
      values ('${DEMO_PRO}', 'plumber', 'Piantini', 2000, 4000, 'approved');
  `);
}

for (const file of migrations) {
  await seedDemoProBeforeMigration(file);
  await db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
}

// Supabase grants these to the API roles by default on public tables.
await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
  grant usage on schema storage to authenticated;
  grant select, insert on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
  -- Supabase grants anon table access by default; RLS is what blocks rows.
  grant usage on schema public to anon;
  grant select on all tables in schema public to anon;
`);

// Seed as the SQL editor would (no auth.uid), so the auth trigger creates profiles.
await seedFixture(`
  insert into auth.users (id, phone) values
    ('${HOMEOWNER}', '+18095550001'),
    ('${PRO}', '+18095550002'),
    ('${ADMIN}', '+18095550003'),
    ('${OUTSIDER_PRO}', '+18095550004'),
    ('${PENDING_PRO}', '+18095550005'),
    ('${COMPANY_PRO}', '+18095550006');
  update public.profiles set role = 'pro' where id in ('${PRO}', '${OUTSIDER_PRO}', '${PENDING_PRO}', '${COMPANY_PRO}');
  update public.profiles set full_name = 'TEST Pro Uno' where id = '${PRO}';
  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status)
    values ('${PRO}', 'plumber', 'Piantini', 2000, 4000, 'pending'),
           ('${OUTSIDER_PRO}', 'electrician', 'Naco', 2000, 4000, 'approved'),
           ('${PENDING_PRO}', 'ac_technician', 'Gazcue', 2000, 4000, 'pending');
  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status, pro_type)
    values ('${COMPANY_PRO}', 'ac_technician', 'Naco', 2000, 4000, 'pending', 'company');
  insert into public.jobs (id, homeowner_id, trade, zone, description)
    values ('${JOB}', '${HOMEOWNER}', 'plumber', 'Piantini', 'TEST: fuga en baño');
  insert into public.quotes (job_id, pro_id, amount_dop)
    values ('${JOB}', '${PRO}', 3000);
`);
// Admin role after the admin's auth.users row exists (the profile is created by the auth trigger).
await db.exec(`update public.profiles set role = 'admin', admin_role = 'super_admin' where id = '${ADMIN}';`);
// 0108: the fixture PRO is not a launch pro by default, so existing commission tests keep their normal math.
// First-job waiver tests delete this row inside their own rollback.
await db.exec(`insert into public.pro_launch_waivers (pro_id, reason) values ('${PRO}', 'pre_launch') on conflict do nothing;`);

/** Runs SQL as a given user and returns the result. Always resets role. */
async function asUser(uid, sql) {
  // Only the seed admin gets an aal2 session (is_admin() needs aal2, see 0061).
  const aal = uid === ADMIN ? "aal2" : "aal1";
  await db.exec(
    `set role authenticated; set request.jwt.claim.sub = '${uid}';
     set request.jwt.claims = '{"sub":"${uid}","role":"authenticated","aal":"${aal}"}';`,
  );
  const reset = "reset role; reset request.jwt.claim.sub; reset request.jwt.claims;";
  let result;
  try {
    result = await db.query(sql);
  } catch (err) {
    // A refused statement aborts an open transaction, so the reset would fail and mask err.
    // The caller's savepoint rollback restores the role, so the reset is best-effort here.
    await db.exec(reset).catch(() => {});
    throw err;
  }
  await db.exec(reset);
  return result;
}

/**
 * Runs seed SQL as the owning user's identity (auth.uid() = uid), keeping the role as the seed role.
 * Job inserts pass through the suspension trigger (0075, is_client_suspended in 0076), which only
 * allows the subject or an admin. Seeding as the owner keeps that trigger active instead of disabling it.
 */
async function asOwner(uid, fn) {
  await db.exec(`set request.jwt.claim.sub = '${uid}'`);
  try {
    return await fn();
  } finally {
    // If fn left an open transaction aborted, this reset fails. The enclosing withRollback
    // rolls the SET back, so the identity is cleared either way. Never mask fn's own error.
    await db.exec("reset request.jwt.claim.sub").catch(() => {});
  }
}

// Known-red checks. Each entry is a test-side defect with its reason. Group: TEST STALE.
// Product-behavior questions: none (suspension trigger is kept by decision, 2026-11-18).
// Fix list: the suite repair step before item 4. Remove an entry when its check passes.
const KNOWN_RED = {};

const results = [];
const ranNames = new Set();
async function closeWindows() {
  // Test helper: the evidence window is 48h. Close it so the admin decision is allowed.
  await db.exec("update public.disputes set evidence_due_at = now() - interval '1 minute' where stage = 'evidence'");
}

async function check(name, fn) {
  ranNames.add(name);
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    const msg = `${name}: ${e.message.split("\n").join(" | ")}`;
    if (KNOWN_RED[name]) results.push(["KNOWN_RED", `${msg}  [${KNOWN_RED[name]}]`]);
    else results.push(["FAIL", msg]);
  }
}

// ---- Sprint 0 checks -------------------------------------------------------

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
    /Solo un (super )?administrador/,
  );
});

await check("quoting pro reads job without RLS recursion", async () => {
  const r = await asUser(PRO, "select id from public.jobs");
  assert.equal(r.rows.length, 1);
});

await check("homeowner reads own job, unrelated pro does not", async () => {
  assert.equal((await asUser(HOMEOWNER, "select id from public.jobs")).rows.length, 1);
  assert.equal((await asUser(OUTSIDER_PRO, "select id from public.jobs")).rows.length, 0);
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

await check("job FX rate must be positive", async () => {
  await assert.rejects(
    asUser(
      HOMEOWNER,
      `insert into public.jobs (homeowner_id, trade, zone, description, fx_rate_dop_per_usd)
       values ('${HOMEOWNER}', 'plumber', 'Naco', 'TEST: x', 0)`,
    ),
    /row-level security|check constraint/,
  );
  // As the seed role (no RLS), so the check constraint itself is what refuses the row.
  await withRollback(async () => {
    await assert.rejects(
      asOwner(HOMEOWNER, () => db.exec(`insert into public.jobs (homeowner_id, trade, zone, description, fx_rate_dop_per_usd)
         values ('${HOMEOWNER}', 'plumber', 'Naco', 'TEST: x', 0)`)),
      /check constraint/,
    );
  });
});

// ---- Sprint 1 checks -------------------------------------------------------

await check("zone must be a Santo Domingo zone", async () => {
  await assert.rejects(
    db.exec(`insert into public.pros (id, trade, zone, price_min_dop, price_max_dop)
             values ('${PENDING_PRO}', 'plumber', 'Santiago', 1000, 2000)
             on conflict (id) do update set zone = 'Santiago'`),
    /pros_zone_valid|check constraint/,
  );
});

await check("list_pro_cards returns no private columns", async () => {
  // Private pro and company fields must never appear in the public card function.
  const r = await asUser(HOMEOWNER, "select * from public.list_pro_cards()");
  const cols = Object.keys(r.rows[0] ?? {});
  const PRIVATE = [
    "stripe_account_id", "plan_stripe_subscription_id", "plan_current_period_end", "plan_activated_at",
    "verified_by", "rejection_reason", "suspended_at", "pro_free_until", "closed_at", "rnc", "rnc_verified_by",
  ];
  for (const c of PRIVATE) assert.ok(!cols.includes(c), `private column leaked: ${c}`);
});

await check("list_pro_cards shows only approved pros", async () => {
  const r = await asUser(HOMEOWNER, "select id from public.list_pro_cards()");
  const ids = r.rows.map((x) => x.id);
  assert.ok(ids.includes(OUTSIDER_PRO));
  assert.ok(!ids.includes(PRO));          // pending at this point
  assert.ok(!ids.includes(PENDING_PRO));  // pending
});

await check("list_pro_cards filters by trade and zone", async () => {
  const byTrade = await asUser(HOMEOWNER, `select id from public.list_pro_cards('electrician', null)`);
  assert.ok(byTrade.rows.some((x) => x.id === OUTSIDER_PRO));
  const wrongTrade = await asUser(HOMEOWNER, `select id from public.list_pro_cards('plumber', null)`);
  assert.equal(wrongTrade.rows.some((x) => x.id === OUTSIDER_PRO), false);
  const byZone = await asUser(HOMEOWNER, `select id from public.list_pro_cards(null, 'Naco')`);
  assert.ok(byZone.rows.some((x) => x.id === OUTSIDER_PRO));
  const wrongZone = await asUser(HOMEOWNER, `select id from public.list_pro_cards(null, 'Gazcue')`);
  assert.equal(wrongZone.rows.some((x) => x.id === OUTSIDER_PRO), false);
});

await check("anonymous users can browse approved pro cards", async () => {
  await db.exec("set role anon;");
  try {
    const r = await db.query("select id, full_name, trade, zone from public.list_pro_cards()");
    assert.ok(r.rows.some((x) => x.id === OUTSIDER_PRO));
    assert.ok(!r.rows.some((x) => x.id === PENDING_PRO));
  } finally {
    await db.exec("reset role;");
  }
});

await check("anonymous users cannot read profiles, pros table, or pro files", async () => {
  await db.exec("set role anon;");
  try {
    const p = await db.query("select id from public.profiles");
    assert.equal(p.rows.length, 0);
    const pr = await db.query("select id from public.pros where verification_status = 'pending'");
    assert.equal(pr.rows.length, 0);
    const f = await db.query("select id from public.pro_files");
    assert.equal(f.rows.length, 0);
  } finally {
    await db.exec("reset role;");
  }
});

await check("non-admin cannot run admin_review_pro", async () => {
  await assert.rejects(
    asUser(PRO, `select public.admin_review_pro('${PRO}', 'approved')`),
    /permission denied|Solo un administrador/,
  );
});

await check("admin approves a pro: badge set and role granted", async () => {
  await asUser(ADMIN, `select public.admin_review_pro('${PRO}', 'approved')`);
  const p = await db.query(`select verification_status, verified_by from public.pros where id = '${PRO}'`);
  assert.equal(p.rows[0].verification_status, "approved");
  assert.equal(p.rows[0].verified_by, ADMIN);
  const pr = await db.query(`select role from public.profiles where id = '${PRO}'`);
  assert.equal(pr.rows[0].role, "pro");
});

await check("admin suspends a pro: badge removed", async () => {
  await asUser(ADMIN, `select public.admin_review_pro('${PRO}', 'suspended')`);
  const r = await asUser(HOMEOWNER, `select id from public.list_pro_cards() where id = '${PRO}'`);
  assert.equal(r.rows.length, 0);
  await asUser(ADMIN, `select public.admin_review_pro('${PRO}', 'approved')`);
});

await check("admin_review_pro rejects unknown status", async () => {
  await assert.rejects(
    asUser(ADMIN, `select public.admin_review_pro('${PRO}', 'verified')`),
    /Estado no válido/,
  );
});

await check("pro cannot read another pro's pro_files; owner can", async () => {
  await asUser(PRO, `insert into public.pro_files (pro_id, kind, storage_path)
                     values ('${PRO}', 'id_document', '${PRO}/id.jpg')`);
  const other = await asUser(OUTSIDER_PRO, `select id from public.pro_files where pro_id = '${PRO}'`);
  assert.equal(other.rows.length, 0);
  const own = await asUser(PRO, `select id from public.pro_files where pro_id = '${PRO}'`);
  assert.equal(own.rows.length, 1);
});

await check("homeowner sees approved pro's work photo, not ID document", async () => {
  await asUser(OUTSIDER_PRO, `insert into public.pro_files (pro_id, kind, storage_path)
                              values ('${OUTSIDER_PRO}', 'work_photo', '${OUTSIDER_PRO}/w1.jpg'),
                                     ('${OUTSIDER_PRO}', 'id_document', '${OUTSIDER_PRO}/id.jpg')`);
  const r = await asUser(HOMEOWNER, `select kind from public.pro_files where pro_id = '${OUTSIDER_PRO}'`);
  assert.deepEqual(r.rows.map((x) => x.kind), ["work_photo"]);
});

await check("homeowner cannot see work photos of an unapproved pro", async () => {
  await asUser(PENDING_PRO, `insert into public.pro_files (pro_id, kind, storage_path)
                             values ('${PENDING_PRO}', 'work_photo', '${PENDING_PRO}/w1.jpg')`);
  const r = await asUser(HOMEOWNER, `select id from public.pro_files where pro_id = '${PENDING_PRO}'`);
  assert.equal(r.rows.length, 0);
});

await check("storage: pro can upload only into own folder", async () => {
  await asUser(PRO, `insert into storage.objects (bucket_id, name)
                     values ('pro-documents', '${PRO}/id.jpg')`);
  await assert.rejects(
    asUser(PRO, `insert into storage.objects (bucket_id, name)
                 values ('pro-documents', '${OUTSIDER_PRO}/id.jpg')`),
    /row-level security/,
  );
});

await check("storage: ID documents are private to owner and admin", async () => {
  const other = await asUser(OUTSIDER_PRO, `select id from storage.objects where bucket_id = 'pro-documents'`);
  assert.equal(other.rows.length, 0);
  const admin = await asUser(ADMIN, `select id from storage.objects where bucket_id = 'pro-documents'`);
  assert.ok(admin.rows.length >= 1);
});

await check("storage: approved pro's work photos readable by signed-in users", async () => {
  await asUser(OUTSIDER_PRO, `insert into storage.objects (bucket_id, name)
                              values ('pro-work-photos', '${OUTSIDER_PRO}/w1.jpg')`);
  const r = await asUser(HOMEOWNER, `select name from storage.objects where bucket_id = 'pro-work-photos'`);
  assert.ok(r.rows.some((x) => x.name === `${OUTSIDER_PRO}/w1.jpg`));
});

await check("storage: unapproved pro's work photos hidden", async () => {
  await asUser(PENDING_PRO, `insert into storage.objects (bucket_id, name)
                             values ('pro-work-photos', '${PENDING_PRO}/w1.jpg')`);
  const r = await asUser(HOMEOWNER, `select name from storage.objects where name like '${PENDING_PRO}%'`);
  assert.equal(r.rows.length, 0);
});

// ---- Sprint 1 · company verification (migration 0007) ----------------------

await check("company pro can add its own company row; individual pro cannot", async () => {
  await asUser(COMPANY_PRO, `insert into public.pro_companies (pro_id, razon_social, rnc)
                             values ('${COMPANY_PRO}', 'TEST Empresa SRL', '131234567')`);
  await assert.rejects(
    asUser(PRO, `insert into public.pro_companies (pro_id, razon_social, rnc)
                 values ('${PRO}', 'TEST Individual', '131234568')`),
    /row-level security/,
  );
});

await check("RNC must be exactly 9 digits", async () => {
  await assert.rejects(
    asUser(OUTSIDER_PRO, `insert into public.pro_companies (pro_id, razon_social, rnc)
                          values ('${OUTSIDER_PRO}', 'TEST', '12345678')`),
    /check constraint|row-level security/,
  );
});

await check("company row is hidden from homeowners, other pros, and anon", async () => {
  const home = await asUser(HOMEOWNER, `select rnc from public.pro_companies`);
  assert.equal(home.rows.length, 0);
  const other = await asUser(OUTSIDER_PRO, `select rnc from public.pro_companies`);
  assert.equal(other.rows.length, 0);
  await db.exec("set role anon;");
  try {
    const anon = await db.query("select rnc from public.pro_companies;");
    assert.equal(anon.rows.length, 0);
  } finally {
    await db.exec("reset role;");
  }
});

await check("owner and admin can read the company row", async () => {
  const own = await asUser(COMPANY_PRO, `select rnc from public.pro_companies where pro_id = '${COMPANY_PRO}'`);
  assert.equal(own.rows.length, 1);
  const admin = await asUser(ADMIN, `select rnc from public.pro_companies where pro_id = '${COMPANY_PRO}'`);
  assert.equal(admin.rows.length, 1);
});

await check("company owner cannot change the RNC after insert", async () => {
  const r = await asUser(COMPANY_PRO, `update public.pro_companies set rnc = '999999999'
                                        where pro_id = '${COMPANY_PRO}'`);
  assert.equal(r.affectedRows, 0);
});

await check("company document is private to owner and admin", async () => {
  await asUser(COMPANY_PRO, `insert into public.pro_files (pro_id, kind, storage_path)
                             values ('${COMPANY_PRO}', 'company_document', '${COMPANY_PRO}/rnc.pdf')`);
  const home = await asUser(HOMEOWNER, `select id from public.pro_files
                                         where pro_id = '${COMPANY_PRO}' and kind = 'company_document'`);
  assert.equal(home.rows.length, 0);
  const own = await asUser(COMPANY_PRO, `select id from public.pro_files
                                          where pro_id = '${COMPANY_PRO}' and kind = 'company_document'`);
  assert.equal(own.rows.length, 1);
});

await check("admin cannot approve a company pro before RNC verification", async () => {
  await assert.rejects(
    asUser(ADMIN, `select public.admin_review_pro('${COMPANY_PRO}', 'approved')`),
    /Verifica el RNC/,
  );
});

await check("admin_verify_rnc is admin only and records who verified", async () => {
  await assert.rejects(
    asUser(COMPANY_PRO, `select public.admin_verify_rnc('${COMPANY_PRO}')`),
    /Solo un administrador/,
  );
  await asUser(ADMIN, `select public.admin_verify_rnc('${COMPANY_PRO}')`);
  const r = await asUser(ADMIN, `select rnc_verified_at, rnc_verified_by from public.pro_companies
                                  where pro_id = '${COMPANY_PRO}'`);
  assert.ok(r.rows[0].rnc_verified_at);
  assert.equal(r.rows[0].rnc_verified_by, ADMIN);
});

await check("admin_verify_rnc rejects a pro with no company row", async () => {
  await assert.rejects(
    asUser(ADMIN, `select public.admin_verify_rnc('${PENDING_PRO}')`),
    /no tiene datos de empresa/,
  );
});

await check("company pro can be approved after RNC verification", async () => {
  await asUser(ADMIN, `select public.admin_review_pro('${COMPANY_PRO}', 'approved')`);
  const r = await asUser(HOMEOWNER, `select id from public.list_pro_cards(null, null, '${COMPANY_PRO}')`);
  assert.equal(r.rows.length, 1);
});

await check("individual pro approval does not require RNC", async () => {
  await asUser(ADMIN, `select public.admin_review_pro('${PRO}', 'approved')`);
  const r = await asUser(HOMEOWNER, `select id from public.list_pro_cards(null, null, '${PRO}')`);
  assert.equal(r.rows.length, 1);
});

// ---- Application submit is one transaction (create_pro_application) ----------

const NEW_APPLICANT = "00000000-0000-0000-0000-000000000007";
const NEW_APPLICANT_2 = "00000000-0000-0000-0000-000000000008";

await check("failed company submit leaves no pro row (rollback, retry possible)", async () => {
  await db.exec(`insert into auth.users (id, phone) values ('${NEW_APPLICANT}', '+18095550007')`);
  await assert.rejects(
    asUser(NEW_APPLICANT, `select public.create_pro_application(
      'TEST Empresa Fallida', 'plumber', 'Naco', 2000, 4000, 'company',
      '${NEW_APPLICANT}/id.jpg', array['${NEW_APPLICANT}/w1.jpg']::text[],
      '${NEW_APPLICANT}/rnc.pdf', 'TEST Empresa SRL', '12345678')`),
    /row-level security|check constraint/,
  );
  const r = await db.query(`select id from public.pros where id = '${NEW_APPLICANT}'`);
  assert.equal(r.rows.length, 0);
  const f = await db.query(`select id from public.pro_files where pro_id = '${NEW_APPLICANT}'`);
  assert.equal(f.rows.length, 0);
});

await check("company submit writes pro, company, and file rows together", async () => {
  await asUser(NEW_APPLICANT, `select public.create_pro_application(
    'TEST Empresa OK', 'plumber', 'Naco', 2000, 4000, 'company',
    '${NEW_APPLICANT}/id.jpg', array['${NEW_APPLICANT}/w1.jpg']::text[],
    '${NEW_APPLICANT}/rnc.pdf', 'TEST Empresa SRL', '131234567')`);
  const p = await db.query(`select pro_type from public.pros where id = '${NEW_APPLICANT}'`);
  assert.equal(p.rows[0].pro_type, "company");
  const c = await db.query(`select rnc from public.pro_companies where pro_id = '${NEW_APPLICANT}'`);
  assert.equal(c.rows[0].rnc, "131234567");
  const f = await db.query(`select kind from public.pro_files where pro_id = '${NEW_APPLICANT}' order by kind`);
  assert.deepEqual(f.rows.map((x) => x.kind), ["company_document", "id_document", "work_photo"]);
});

await check("individual submit rejects company fields and writes no company row", async () => {
  await db.exec(`insert into auth.users (id, phone) values ('${NEW_APPLICANT_2}', '+18095550008')`);
  await assert.rejects(
    asUser(NEW_APPLICANT_2, `select public.create_pro_application(
      'TEST Indiv', 'plumber', 'Naco', 2000, 4000, 'individual',
      '${NEW_APPLICANT_2}/id.jpg', array['${NEW_APPLICANT_2}/w1.jpg']::text[],
      '${NEW_APPLICANT_2}/rnc.pdf', 'TEST', '131234567')`),
    /no envían datos de empresa/,
  );
  await asUser(NEW_APPLICANT_2, `select public.create_pro_application(
    'TEST Indiv', 'plumber', 'Naco', 2000, 4000, 'individual',
    '${NEW_APPLICANT_2}/id.jpg', array['${NEW_APPLICANT_2}/w1.jpg']::text[],
    null, null, null)`);
  const c = await db.query(`select pro_id from public.pro_companies where pro_id = '${NEW_APPLICANT_2}'`);
  assert.equal(c.rows.length, 0);
});

// ---- Profile photo (migration 0008) ---------------------------------------

const AV_PRO = "00000000-0000-0000-0000-00000000000a";
const AV_PRO_2 = "00000000-0000-0000-0000-00000000000b";

await check("avatar: submit stores a pending avatar; foreign folder rejected", async () => {
  await db.exec(`insert into auth.users (id, phone) values ('${AV_PRO}', '+18095550010')`);
  await assert.rejects(
    asUser(AV_PRO, `select public.create_pro_application('TEST Foto', 'plumber', 'Naco', 2000, 4000, 'individual',
      '${AV_PRO}/id.jpg', array['${AV_PRO}/w1.jpg']::text[], null, null, null, '${OUTSIDER_PRO}/avatar.jpg')`),
    /tu carpeta/,
  );
  await asUser(AV_PRO, `select public.create_pro_application('TEST Foto', 'plumber', 'Naco', 2000, 4000, 'individual',
    '${AV_PRO}/id.jpg', array['${AV_PRO}/w1.jpg']::text[], null, null, null, '${AV_PRO}/avatar.jpg')`);
  const r = await db.query(`select review_status from public.pro_files where pro_id = '${AV_PRO}' and kind = 'avatar'`);
  assert.deepEqual(r.rows.map((x) => x.review_status), ["pending"]);
});

await check("owner cannot change avatar review status", async () => {
  const r = await asUser(AV_PRO, `update public.pro_files set review_status = 'approved'
                                   where pro_id = '${AV_PRO}' and kind = 'avatar'`);
  assert.equal(r.affectedRows, 0);
});

await check("only admin can review avatars", async () => {
  const f = await db.query(`select id from public.pro_files where pro_id = '${AV_PRO}' and kind = 'avatar'`);
  await assert.rejects(
    asUser(AV_PRO, `select public.admin_review_avatar('${f.rows[0].id}', 'approved')`),
    /Solo un administrador/,
  );
});

await check("pending avatar blocks approval", async () => {
  await assert.rejects(
    asUser(ADMIN, `select public.admin_review_pro('${AV_PRO}', 'approved')`),
    /Revisa la foto/,
  );
});

await check("approved avatar appears on the public card after approval", async () => {
  const f = await db.query(`select id from public.pro_files where pro_id = '${AV_PRO}' and kind = 'avatar'`);
  await asUser(ADMIN, `select public.admin_review_avatar('${f.rows[0].id}', 'approved')`);
  await asUser(ADMIN, `select public.admin_review_pro('${AV_PRO}', 'approved')`);
  const r = await asUser(HOMEOWNER, `select avatar_path from public.list_pro_cards(null, null, '${AV_PRO}')`);
  assert.equal(r.rows[0].avatar_path, `${AV_PRO}/avatar.jpg`);
});

await check("rejected avatar does not block approval and is never shown", async () => {
  await db.exec(`insert into auth.users (id, phone) values ('${AV_PRO_2}', '+18095550011')`);
  await asUser(AV_PRO_2, `select public.create_pro_application('TEST Foto 2', 'plumber', 'Naco', 2000, 4000, 'individual',
    '${AV_PRO_2}/id.jpg', array['${AV_PRO_2}/w1.jpg']::text[], null, null, null, '${AV_PRO_2}/avatar.jpg')`);
  const f = await db.query(`select id from public.pro_files where pro_id = '${AV_PRO_2}' and kind = 'avatar'`);
  await asUser(ADMIN, `select public.admin_review_avatar('${f.rows[0].id}', 'rejected')`);
  await asUser(ADMIN, `select public.admin_review_pro('${AV_PRO_2}', 'approved')`);
  const r = await asUser(HOMEOWNER, `select avatar_path from public.list_pro_cards(null, null, '${AV_PRO_2}')`);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].avatar_path, null);
});

await check("storage: avatar upload only into own folder", async () => {
  await asUser(AV_PRO, `insert into storage.objects (bucket_id, name) values ('pro-avatars', '${AV_PRO}/x.jpg')`);
  await assert.rejects(
    asUser(AV_PRO, `insert into storage.objects (bucket_id, name) values ('pro-avatars', '${AV_PRO_2}/x.jpg')`),
    /row-level security/,
  );
});

// ---------------------------------------------------------------------------
// 0009 · Customer profile: guard, customer card, private customer-avatars bucket.
// ---------------------------------------------------------------------------
const CUST_OWN = HOMEOWNER; // JOB's homeowner; PRO has a quote on JOB, OUTSIDER_PRO does not.

await check("profile: owner can set own zone and own-folder avatar", async () => {
  await asUser(HOMEOWNER, `update public.profiles set zone = 'Naco', avatar_path = '${CUST_OWN}/a.jpg' where id = '${CUST_OWN}'`);
  const r = await asUser(HOMEOWNER, `select zone, avatar_path from public.profiles where id = '${CUST_OWN}'`);
  assert.equal(r.rows[0].zone, "Naco");
  assert.equal(r.rows[0].avatar_path, `${CUST_OWN}/a.jpg`);
});

await check("profile: owner cannot point avatar at another folder", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `update public.profiles set avatar_path = '${PRO}/x.jpg' where id = '${CUST_OWN}'`),
    /carpeta/,
  );
});

await check("profile: owner cannot change phone", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `update public.profiles set phone = '+18095559999' where id = '${CUST_OWN}'`),
    /teléfono/,
  );
});

await check("profile: owner cannot set email or email_verified_at directly", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `update public.profiles set email = 'x@example.com' where id = '${CUST_OWN}'`),
    /código/,
  );
  await assert.rejects(
    asUser(HOMEOWNER, `update public.profiles set email_verified_at = now() where id = '${CUST_OWN}'`),
    /código/,
  );
});

await check("profile: service role (verification function) can set email", async () => {
  await db.exec(`update public.profiles set email = 'test@example.com', email_verified_at = now() where id = '${CUST_OWN}'`);
  const r = await db.query(`select email, email_verified_at from public.profiles where id = '${CUST_OWN}'`);
  assert.equal(r.rows[0].email, "test@example.com");
  assert.ok(r.rows[0].email_verified_at);
});

await check("profile: owner can stamp own email prompt, not another user's", async () => {
  await db.exec(`update public.profiles set email_prompt_dismissed_at = null where id = '${CUST_OWN}'`);
  await asUser(HOMEOWNER, `update public.profiles set email_prompt_dismissed_at = now() where id = '${CUST_OWN}'`);
  const own = await db.query(`select email_prompt_dismissed_at from public.profiles where id = '${CUST_OWN}'`);
  assert.ok(own.rows[0].email_prompt_dismissed_at, "owner stamp should persist");

  await db.exec(`update public.profiles set email_prompt_dismissed_at = null where id = '${CUST_OWN}'`);
  await asUser(OUTSIDER_PRO, `update public.profiles set email_prompt_dismissed_at = now() where id = '${CUST_OWN}'`);
  const other = await db.query(`select email_prompt_dismissed_at from public.profiles where id = '${CUST_OWN}'`);
  assert.equal(other.rows[0].email_prompt_dismissed_at, null, "other user must not stamp this row");
});

await check("profile: other users cannot read a customer's email", async () => {
  const r = await asUser(OUTSIDER_PRO, `select email from public.profiles where id = '${CUST_OWN}'`);
  assert.equal(r.rows.length, 0);
});

await check("customer card: pro with a quote on the job gets first name, avatar, zone only", async () => {
  const r = await asUser(PRO, `select * from public.get_customer_card('${CUST_OWN}')`);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ["avatar_path", "first_name", "zone"]);
  assert.equal(r.rows[0].zone, "Naco");
  assert.equal(r.rows[0].avatar_path, `${CUST_OWN}/a.jpg`);
});

await check("customer card: pro without a job or quote gets nothing", async () => {
  const r = await asUser(OUTSIDER_PRO, `select * from public.get_customer_card('${CUST_OWN}')`);
  assert.equal(r.rows.length, 0);
});

await check("customer card: anonymous gets nothing (no execute grant)", async () => {
  await db.exec("set role anon;");
  try {
    await assert.rejects(
      db.query(`select * from public.get_customer_card('${CUST_OWN}')`),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role;");
  }
});

await check("customer card: admin sees the card", async () => {
  const r = await asUser(ADMIN, `select * from public.get_customer_card('${CUST_OWN}')`);
  assert.equal(r.rows.length, 1);
});

await check("storage: customer photo upload only into own folder", async () => {
  await asUser(HOMEOWNER, `insert into storage.objects (bucket_id, name) values ('customer-avatars', '${CUST_OWN}/a.jpg')`);
  await assert.rejects(
    asUser(HOMEOWNER, `insert into storage.objects (bucket_id, name) values ('customer-avatars', '${PRO}/x.jpg')`),
    /row-level security/,
  );
});

await check("storage: customer photo visible to owner, related pro, admin; not to outsider", async () => {
  const own = await asUser(HOMEOWNER, `select name from storage.objects where bucket_id = 'customer-avatars'`);
  assert.equal(own.rows.length, 1);
  const pro = await asUser(PRO, `select name from storage.objects where bucket_id = 'customer-avatars'`);
  assert.equal(pro.rows.length, 1);
  const admin = await asUser(ADMIN, `select name from storage.objects where bucket_id = 'customer-avatars'`);
  assert.equal(admin.rows.length, 1);
  const outsider = await asUser(OUTSIDER_PRO, `select name from storage.objects where bucket_id = 'customer-avatars'`);
  assert.equal(outsider.rows.length, 0);
});

await check("storage: customer photo cannot be listed by pros who never had a job", async () => {
  const r = await asUser(OUTSIDER_PRO, `select public.can_view_customer_avatar('${CUST_OWN}/a.jpg') as ok`);
  assert.equal(r.rows[0].ok, false);
});

await check("verification codes: not readable by users (service role only)", async () => {
  const r = await asUser(HOMEOWNER, `select id from public.email_verifications`);
  assert.equal(r.rows.length, 0);
});

// ---------------------------------------------------------------------------
// 0010 · Account deletion: anonymise_customer.
// ---------------------------------------------------------------------------
const DEL = "00000000-0000-0000-0000-000000000021"; // completed job, review, photo
const DEL_HELD = "00000000-0000-0000-0000-000000000022"; // held payment
const DEL_DISPUTE = "00000000-0000-0000-0000-000000000023"; // open dispute
const DEL_JOB = "10000000-0000-0000-0000-000000000021";
const DEL_JOB_HELD = "10000000-0000-0000-0000-000000000022";
const DEL_JOB_DISPUTE = "10000000-0000-0000-0000-000000000023";

await seedFixture(`
  insert into auth.users (id, phone) values
    ('${DEL}', '+18095550021'), ('${DEL_HELD}', '+18095550022'), ('${DEL_DISPUTE}', '+18095550023');
  update public.profiles set full_name = 'TEST Borrar Uno', zone = 'Naco',
    avatar_path = '${DEL}/borrar.jpg', email = 'borrar@example.com', email_verified_at = now()
    where id = '${DEL}';
  update public.profiles set full_name = 'TEST Borrar Dos' where id = '${DEL_HELD}';
  update public.profiles set full_name = 'TEST Borrar Tres' where id = '${DEL_DISPUTE}';
  insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status) values
    ('${DEL_JOB}', '${DEL}', '${PRO}', 'plumber', 'Naco', 'TEST: calle privada 12', 'completed'),
    ('${DEL_JOB_HELD}', '${DEL_HELD}', '${PRO}', 'plumber', 'Naco', 'TEST: pago retenido', 'completed'),
    ('${DEL_JOB_DISPUTE}', '${DEL_DISPUTE}', '${PRO}', 'plumber', 'Naco', 'TEST: disputa', 'completed');
  insert into public.reviews (job_id, reviewer_id, pro_id, rating, comment)
    values ('${DEL_JOB}', '${DEL}', '${PRO}', 4, 'TEST: buen trabajo');
  insert into public.email_verifications (user_id, email, code_hash, expires_at)
    values ('${DEL}', 'borrar@example.com', 'x', now() + interval '15 minutes');
`);

await check("deletion: blocked for a customer with an open job", async () => {
  await assert.rejects(
    db.query(`select public.anonymise_customer('${HOMEOWNER}')`),
    /trabajos abiertos/,
  );
});

await check("deletion: blocked for a customer with a pro profile", async () => {
  await assert.rejects(db.query(`select public.anonymise_customer('${PRO}')`), /perfil profesional/);
});

await check("deletion: blocked while a payment is held", async () => {
  await db.exec(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, commission_dop, status)
                 values ('${DEL_JOB_HELD}', 'stripe', 'USD', 10000, 60, 720, 'held')`);
  await assert.rejects(db.query(`select public.anonymise_customer('${DEL_HELD}')`), /pagos retenidos/);
});

await check("deletion: blocked while a dispute is open", async () => {
  await db.exec(`insert into public.disputes (job_id, opened_by, reason, status)
                 values ('${DEL_JOB_DISPUTE}', '${DEL_DISPUTE}', 'TEST', 'open')`);
  await assert.rejects(db.query(`select public.anonymise_customer('${DEL_DISPUTE}')`), /disputa abierta/);
});

await check("deletion: only the service role can call it", async () => {
  await db.exec("set role authenticated;");
  await db.exec(`set request.jwt.claim.sub = '${DEL}';`);
  try {
    await assert.rejects(db.query(`select public.anonymise_customer('${DEL}')`), /permission denied/);
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
});

await check("deletion: clears personal data and returns the photo path to remove", async () => {
  const r = await db.query(`select public.anonymise_customer('${DEL}') as paths`);
  assert.deepEqual(r.rows[0].paths.avatars, [`${DEL}/borrar.jpg`]);
  assert.deepEqual(r.rows[0].paths.job_files, []);
  const p = await db.query(`select full_name, phone, email, email_verified_at, zone, avatar_path
                              from public.profiles where id = '${DEL}'`);
  assert.equal(p.rows[0].full_name, null);
  assert.equal(p.rows[0].phone, null);
  assert.equal(p.rows[0].email, null);
  assert.equal(p.rows[0].email_verified_at, null);
  assert.equal(p.rows[0].zone, null);
  assert.equal(p.rows[0].avatar_path, null);
  const codes = await db.query(`select id from public.email_verifications where user_id = '${DEL}'`);
  assert.equal(codes.rows.length, 0);
});

await check("deletion: job record kept, description replaced, review kept", async () => {
  const j = await db.query(`select status, trade, zone, description from public.jobs where id = '${DEL_JOB}'`);
  assert.equal(j.rows.length, 1);
  assert.equal(j.rows[0].status, "completed");
  assert.equal(j.rows[0].trade, "plumber");
  assert.equal(j.rows[0].description, "[eliminado]");
  const rev = await db.query(`select rating from public.reviews where job_id = '${DEL_JOB}'`);
  assert.equal(rev.rows.length, 1);
  assert.equal(rev.rows[0].rating, 4);
});

await check("deletion: auth user can be removed; anonymised profile row remains", async () => {
  await db.exec(`delete from auth.users where id = '${DEL}'`);
  const p = await db.query(`select id from public.profiles where id = '${DEL}'`);
  assert.equal(p.rows.length, 1);
  const j = await db.query(`select id from public.jobs where id = '${DEL_JOB}'`);
  assert.equal(j.rows.length, 1);
});

// ---------------------------------------------------------------------------
// 0011 · Sprint 2 job flow.
// ---------------------------------------------------------------------------
const PRO2 = "00000000-0000-0000-0000-000000000031"; // approved plumber, second pro
const HO2 = "00000000-0000-0000-0000-000000000032"; // homeowner for cap test
const HO4 = "00000000-0000-0000-0000-000000000033"; // homeowner for anti-ghosting test

await seedFixture(`
  update public.pros set trade = 'plumber', verification_status = 'approved'
    where id in ('${PRO}', '${OUTSIDER_PRO}');
  update public.pros set trade = 'plumber' where id = '${OUTSIDER_PRO}';
  insert into auth.users (id, phone) values
    ('${PRO2}', '+18095550031'), ('${HO2}', '+18095550032'), ('${HO4}', '+18095550033');
  update public.profiles set role = 'pro' where id = '${PRO2}';
  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status)
    values ('${PRO2}', 'plumber', 'Naco', 500, 5000, 'approved');
`);

const desc = "Fuga de agua debajo del lavamanos";

await check("job request: 4 pros is refused (3-quote cap)", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `select public.create_job_request('plumber','Naco','${desc}','repair',
      array['${PRO}','${OUTSIDER_PRO}','${PRO2}','${COMPANY_PRO}']::uuid[], array['${HOMEOWNER}/a.jpg']::text[])`),
    /Elige entre 1 y 3/,
  );
});

await check("job request: description under 20 characters is refused", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `select public.create_job_request('plumber','Naco','corto','repair',
      array['${PRO}']::uuid[], array['${HOMEOWNER}/a.jpg']::text[])`),
    /al menos 20 caracteres/,
  );
});

await check("job request: no photo is refused", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `select public.create_job_request('plumber','Naco','${desc}','repair',
      array['${PRO}']::uuid[], array[]::text[])`),
    /al menos una foto/,
  );
});

await check("job request: pending (unapproved) pro is refused", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `select public.create_job_request('plumber','Naco','${desc}','repair',
      array['${PENDING_PRO}']::uuid[], array['${HOMEOWNER}/a.jpg']::text[])`),
    /no está disponible/,
  );
});

await check("job request: valid request creates job plus one invited quote per pro", async () => {
  const r = await asUser(HOMEOWNER, `select public.create_job_request('plumber','Naco','${desc}','repair',
    array['${PRO}','${OUTSIDER_PRO}']::uuid[], array['${HOMEOWNER}/a.jpg']::text[], null) as id`);
  const id = r.rows[0].id;
  assert.ok(id);
  const q = await db.query(`select status from public.quotes where job_id = '${id}' order by pro_id`);
  assert.deepEqual(q.rows.map((x) => x.status), ["invited", "invited"]);
  await db.exec(`update public.jobs set created_at = created_at where id = '${id}'`);
  globalThis.J_ANY = id;
});

await check("clients cannot write jobs or quotes directly", async () => {
  await assert.rejects(
    asUser(HOMEOWNER, `insert into public.jobs (homeowner_id, trade, zone, description, status)
      values ('${HOMEOWNER}','plumber','Naco','escritura directa','requested')`),
  );
  const r = await db.query(`select amount_dop from public.quotes where job_id = '${globalThis.J_ANY}' and pro_id = '${PRO}'`);
  assert.equal(r.rows[0].amount_dop, null);
  await asUser(PRO, `update public.quotes set amount_dop = 1 where job_id = '${globalThis.J_ANY}' and pro_id = '${PRO}'`);
  const after = await db.query(`select amount_dop from public.quotes where job_id = '${globalThis.J_ANY}' and pro_id = '${PRO}'`);
  assert.equal(after.rows[0].amount_dop, null, "pro must not set a price directly");
});

await check("open-request cap: 4th open request is refused", async () => {
  const mk = (n) => asUser(HO2, `select public.create_job_request('plumber','Naco','${desc} ${n}','repair',
    array['${PRO}']::uuid[], array['${HO2}/${n}.jpg']::text[])`);
  await mk(1); await mk(2); await mk(3);
  await assert.rejects(mk(4), /Ya tienes 3 solicitudes abiertas/);
});

await check("anti-ghosting: 5 unbooked requests in 30 days blocks new requests", async () => {
  for (let i = 0; i < 5; i++) {
    await asOwner(HO4, () => db.exec(`insert into public.jobs (homeowner_id, trade, zone, description, status, created_at)
      values ('${HO4}','plumber','Naco','solicitud sin contratar ${i}','requested', now() - interval '10 days')`));
  }
  await assert.rejects(
    asUser(HO4, `select public.create_job_request('plumber','Naco','${desc}','repair',
      array['${PRO}']::uuid[], array['${HO4}/x.jpg']::text[])`),
    /demasiadas solicitudes/,
  );
});

await check("quote: pro submits a fixed price with inclusions and a 48h validity", async () => {
  const q = await db.query(`select id from public.quotes where job_id = '${globalThis.J_ANY}' and pro_id = '${PRO}'`);
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  await asUser(PRO, `select public.submit_quote('${q.rows[0].id}', 2400, 'Cambio de sifón y llave', 'Materiales', false,
    '${start}', '${end}', 2)`);
  const r = await db.query(`select status, amount_dop, valid_until - now() as ttl from public.quotes where id = '${q.rows[0].id}'`);
  assert.equal(r.rows[0].status, "sent");
  assert.equal(r.rows[0].amount_dop, 2400);
  assert.ok(r.rows[0].ttl !== null);
});

await check("quote: materials status is required", async () => {
  const q = await db.query(`select id from public.quotes where job_id = '${globalThis.J_ANY}' and pro_id = '${OUTSIDER_PRO}'`);
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  await assert.rejects(
    asUser(OUTSIDER_PRO, `select public.submit_quote('${q.rows[0].id}', 2400, 'Cambio de sifón y llave', null, null,
      '${start}', '${end}', 2)`),
    /materiales/,
  );
});

await check("quote: invite older than 24h cannot be answered", async () => {
  const q = await db.query(`select id from public.quotes where job_id = '${globalThis.J_ANY}' and pro_id = '${OUTSIDER_PRO}'`);
  await db.exec(`update public.quotes set invited_at = now() - interval '25 hours' where id = '${q.rows[0].id}'`);
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  await assert.rejects(
    asUser(OUTSIDER_PRO, `select public.submit_quote('${q.rows[0].id}', 2400, 'Cambio de sifón y llave', null, true,
      '${start}', '${end}', 2)`),
    /24 horas/,
  );
});

await check("quote: only the homeowner can approve, and approval rejects the other quotes", async () => {
  const q = await db.query(`select id from public.quotes where job_id = '${globalThis.J_ANY}' and pro_id = '${PRO}'`);
  await assert.rejects(asUser(PRO, `select public.approve_quote('${q.rows[0].id}')`), /Solo quien pidió/);
  await asUser(HOMEOWNER, `select public.approve_quote('${q.rows[0].id}')`);
  const j = await db.query(`select status, pro_id from public.jobs where id = '${globalThis.J_ANY}'`);
  assert.equal(j.rows[0].status, "accepted");
  assert.equal(j.rows[0].pro_id, PRO);
  const others = await db.query(`select status from public.quotes where job_id = '${globalThis.J_ANY}' and pro_id = '${OUTSIDER_PRO}'`);
  assert.equal(others.rows[0].status, "rejected");
});

await check("contact: phone is hidden while unpaid (D7)", async () => {
  const r = await asUser(HOMEOWNER, `select public.get_contact('${globalThis.J_ANY}') as phone`);
  assert.equal(r.rows[0].phone, null);
});

await check("payment stub removed: test_mark_job_paid no longer exists", async () => {
  const r = await db.query(`select to_regprocedure('public.test_mark_job_paid(uuid)') as fn`);
  assert.equal(r.rows[0].fn, null);
});

await check("payment set by fixture: phone is revealed to both parties once paid", async () => {
  await db.exec(`update public.jobs set payment_status = 'paid' where id = '${globalThis.J_ANY}';`);
  const h = await asUser(HOMEOWNER, `select public.get_contact('${globalThis.J_ANY}') as phone`);
  assert.equal(h.rows[0].phone, "+18095550002");
  const p = await asUser(PRO, `select public.get_contact('${globalThis.J_ANY}') as phone`);
  assert.equal(p.rows[0].phone, "+18095550001");
  const out = await asUser(OUTSIDER_PRO, `select public.get_contact('${globalThis.J_ANY}') as phone`);
  assert.equal(out.rows[0].phone, null);
});

await check("start: needs a before photo; completion code is visible to the pro only", async () => {
  await assert.rejects(asUser(PRO, `select public.start_job('${globalThis.J_ANY}')`), /foto de antes/);
  await asUser(PRO, `select public.add_job_photo('${globalThis.J_ANY}', 'before', '${PRO}/before.jpg')`);
  await asUser(PRO, `select public.start_job('${globalThis.J_ANY}')`);
  const j = await db.query(`select status from public.jobs where id = '${globalThis.J_ANY}'`);
  assert.equal(j.rows[0].status, "in_progress");
  const code = await asUser(PRO, `select public.get_completion_code('${globalThis.J_ANY}') as c`);
  assert.match(code.rows[0].c, /^\d{6}$/);
  await assert.rejects(asUser(HOMEOWNER, `select public.get_completion_code('${globalThis.J_ANY}')`), /Solo el profesional/);
});

await check("photos: pro cannot upload to another pro's folder", async () => {
  await assert.rejects(
    asUser(PRO, `select public.add_job_photo('${globalThis.J_ANY}', 'after', '${OUTSIDER_PRO}/after.jpg')`),
    /Ruta de foto no válida/,
  );
});

await check("close-out: repair needs an after photo", async () => {
  await assert.rejects(asUser(PRO, `select public.submit_closeout('${globalThis.J_ANY}')`), /foto de después/);
});

await check("completion code: wrong codes are counted, correct code completes the job", async () => {
  await asUser(PRO, `select public.add_job_photo('${globalThis.J_ANY}', 'after', '${PRO}/after.jpg')`);
  await asUser(PRO, `select public.submit_closeout('${globalThis.J_ANY}')`);
  const real = await db.query(`select completion_code from public.job_secrets where job_id = '${globalThis.J_ANY}'`);
  const wrong = real.rows[0].completion_code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) {
    await assert.rejects(asUser(HOMEOWNER, `select public.approve_closeout('${globalThis.J_ANY}', '${wrong}')`), /Código incorrecto/);
  }
  await asUser(HOMEOWNER, `select public.approve_closeout('${globalThis.J_ANY}', '${real.rows[0].completion_code}')`);
  const j = await db.query(`select status from public.jobs where id = '${globalThis.J_ANY}'`);
  assert.equal(j.rows[0].status, "completed");
});

await check("completion code: five failures lock the job", async () => {
  const id = "10000000-0000-0000-0000-00000000f003";
  await asOwner(HO2, () => db.exec(`
    insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, payment_status, job_type)
      values ('${id}','${HO2}','${PRO2}','plumber','Naco','bloqueo de código','awaiting_approval','paid','repair');
    insert into public.job_secrets (job_id, completion_code, failed_attempts) values ('${id}','123456',5);`));
  await assert.rejects(asUser(HO2, `select public.approve_closeout('${id}', '123456')`), /Demasiados intentos/);
});

await check("diagnostic: price must be RD$500-1,000", async () => {
  const r = await asUser(HOMEOWNER, `select public.create_job_request('plumber','Naco','${desc} visita','diagnostic',
    array['${PRO2}']::uuid[], array['${HOMEOWNER}/d.jpg']::text[]) as id`);
  globalThis.J_DIAG = r.rows[0].id;
  const q = await db.query(`select id from public.quotes where job_id = '${globalThis.J_DIAG}'`);
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  await assert.rejects(
    asUser(PRO2, `select public.submit_quote('${q.rows[0].id}', 1500, 'Visita de diagnóstico', null, true,
      '${start}', '${end}', 1)`),
    /RD\$500 y RD\$1,000/,
  );
  await asUser(PRO2, `select public.submit_quote('${q.rows[0].id}', 750, 'Visita de diagnóstico', null, true,
    '${start}', '${end}', 1)`);
  await asUser(HOMEOWNER, `select public.approve_quote('${q.rows[0].id}')`);
  await db.exec(`update public.jobs set payment_status = 'paid' where id = '${globalThis.J_DIAG}';`);
  await asUser(PRO2, `select public.start_job('${globalThis.J_DIAG}')`);
});

await check("diagnostic: written diagnosis, then one-tap confirmation completes it", async () => {
  await assert.rejects(asUser(PRO2, `select public.submit_closeout('${globalThis.J_DIAG}', 'corto')`), /al menos 20/);
  await asUser(PRO2, `select public.submit_closeout('${globalThis.J_DIAG}', 'Sifón roto y junta del lavamanos gastada.')`);
  await asUser(HOMEOWNER, `select public.approve_closeout('${globalThis.J_DIAG}', null)`);
  const j = await db.query(`select status from public.jobs where id = '${globalThis.J_DIAG}'`);
  assert.equal(j.rows[0].status, "completed");
});

await check("cancel: free before work starts; the pro's invite is withdrawn", async () => {
  const open = await db.query(`select id from public.jobs where homeowner_id = '${HO2}' and status = 'requested' limit 1`);
  await asUser(HO2, `select public.cancel_job_request('${open.rows[0].id}')`);
  const q = await db.query(`select status from public.quotes where job_id = '${open.rows[0].id}'`);
  assert.ok(q.rows.every((x) => x.status === "withdrawn"));
});

await check("expiry sweep: invites over 24h and quotes past validity become expired", async () => {
  const r = await db.query(`select public.expire_quotes() as n`);
  assert.ok(r.rows[0].n >= 0);
  await assert.rejects(asUser(HOMEOWNER, `select public.expire_quotes()`), /permission denied/);
});

// ---------------------------------------------------------------------------
// 0012 · Revised quotes and job files in deletion.
// ---------------------------------------------------------------------------
const REV_JOB = "10000000-0000-0000-0000-00000000f010";
const REV_HO = "00000000-0000-0000-0000-000000000034";
const REV_PRO = "00000000-0000-0000-0000-000000000035";

await seedFixture(`
  insert into auth.users (id, phone) values ('${REV_HO}', '+18095550034'), ('${REV_PRO}', '+18095550035');
  update public.pros set trade = 'plumber', verification_status = 'approved'
    where id = '${PRO}';
  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status)
    values ('${REV_PRO}', 'plumber', 'Naco', 500, 5000, 'approved');
  insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, payment_status, job_type, voice_path, approved_quote_id)
    values ('${REV_JOB}', '${REV_HO}', '${REV_PRO}', 'plumber', 'Naco', 'TEST: cambio de precio', 'in_progress', 'paid', 'repair',
            '${REV_HO}/voz.m4a', null);
  insert into public.quotes (id, job_id, pro_id, status, amount_dop, includes, materials_included, window_start, window_end,
                             duration_hours, valid_until)
    values ('10000000-0000-0000-0000-00000000f011', '${REV_JOB}', '${REV_PRO}', 'accepted', 2000, 'Trabajo original',
            true, now(), now() + interval '1 day', 2, now() + interval '2 days');
  update public.jobs set approved_quote_id = '10000000-0000-0000-0000-00000000f011' where id = '${REV_JOB}';
  insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
    values ('${REV_JOB}', '${REV_HO}', 'request', '${REV_HO}/problema.jpg'),
           ('${REV_JOB}', '${REV_PRO}', 'after', '${REV_PRO}/despues.jpg');
`);

const later = () => ({
  s: new Date(Date.now() + 3600e3).toISOString(),
  e: new Date(Date.now() + 7200e3).toISOString(),
});

await check("revision: only the assigned pro can propose one", async () => {
  const { s, e } = later();
  await assert.rejects(
    asUser(HOMEOWNER, `select public.propose_revision('${REV_JOB}', 2500, 'Tubería detrás de la pared', null, true, '${s}', '${e}', 3, 'Se encontró tubería rota')`),
    /Solo el profesional asignado/,
  );
});

await check("revision: needs a reason of at least 10 characters", async () => {
  const { s, e } = later();
  await assert.rejects(
    asUser(REV_PRO, `select public.propose_revision('${REV_JOB}', 2500, 'Tubería detrás de la pared', null, true, '${s}', '${e}', 3, 'corto')`),
    /al menos 10/,
  );
});

await check("revision: pro proposes; the original quote stays approved until the homeowner approves", async () => {
  const { s, e } = later();
  const r = await asUser(REV_PRO, `select public.propose_revision('${REV_JOB}', 2500, 'Tubería detrás de la pared', null, true, '${s}', '${e}', 3, 'Se encontró tubería rota') as id`);
  globalThis.REV_Q = r.rows[0].id;
  const q = await db.query(`select status, revision_of from public.quotes where id = '${globalThis.REV_Q}'`);
  assert.equal(q.rows[0].status, "sent");
  assert.equal(q.rows[0].revision_of, "10000000-0000-0000-0000-00000000f011");
  const orig = await db.query(`select status from public.quotes where id = '10000000-0000-0000-0000-00000000f011'`);
  assert.equal(orig.rows[0].status, "accepted");
});

await check("revision: a second pending revision is refused", async () => {
  const { s, e } = later();
  await assert.rejects(
    asUser(REV_PRO, `select public.propose_revision('${REV_JOB}', 2600, 'Otra cosa distinta aquí', null, true, '${s}', '${e}', 3, 'Otro motivo válido')`),
    /pendiente/,
  );
});

await check("revision: approve_quote cannot approve a revision", async () => {
  await assert.rejects(asUser(HOMEOWNER, `select public.approve_quote('${globalThis.REV_Q}')`), /aprobar_cambio|Este cambio/);
});

await check("revision: homeowner approves; old quote superseded; difference recorded", async () => {
  await asUser(REV_HO, `select public.approve_revision('${globalThis.REV_Q}')`);
  const orig = await db.query(`select status from public.quotes where id = '10000000-0000-0000-0000-00000000f011'`);
  assert.equal(orig.rows[0].status, "superseded");
  const j = await db.query(`select approved_quote_id, pending_difference_dop from public.jobs where id = '${REV_JOB}'`);
  assert.equal(j.rows[0].approved_quote_id, globalThis.REV_Q);
  assert.equal(j.rows[0].pending_difference_dop, 500);
});

await check("revision: only in_progress repair jobs accept revisions", async () => {
  await db.exec(`update public.jobs set status = 'awaiting_approval' where id = '${REV_JOB}'`);
  const { s, e } = later();
  await assert.rejects(
    asUser(REV_PRO, `select public.propose_revision('${REV_JOB}', 2700, 'Tubería detrás de la pared', null, true, '${s}', '${e}', 3, 'Otro motivo válido')`),
    /en curso/,
  );
  await db.exec(`update public.jobs set status = 'in_progress' where id = '${REV_JOB}'`);
});

await check("deletion: request photos and voice note are returned and removed; pro photos stay", async () => {
  await db.exec(`insert into auth.users (id, phone) values ('00000000-0000-4000-8000-0000000d0101', '+18095559911')
     on conflict (id) do nothing`);
  await db.exec(`update public.jobs set status = 'completed' where id = '${REV_JOB}'`);
  // REV_HO's job is now completed, so the account can be deleted.
  const r = await db.query(`select public.anonymise_customer('${REV_HO}') as paths`);
  assert.deepEqual(r.rows[0].paths.job_files.sort(), [`${REV_HO}/problema.jpg`, `${REV_HO}/voz.m4a`].sort());
  const left = await db.query(`select storage_path from public.job_photos where job_id = '${REV_JOB}'`);
  assert.deepEqual(left.rows.map((x) => x.storage_path), [`${REV_PRO}/despues.jpg`]);
  const j = await db.query(`select voice_path, description from public.jobs where id = '${REV_JOB}'`);
  assert.equal(j.rows[0].voice_path, null);
  assert.equal(j.rows[0].description, "[eliminado]");
});

// 0013 · Payments split and Stripe event log.
// The suite grants table access to authenticated after migrations (Supabase default
// privileges). RLS with no policies is the effective guard, so assert on rows and RLS.
await check("0013 stripe_events: a signed-in user sees no rows and cannot write", async () => {
  assert.equal((await asUser(HOMEOWNER, "select id from public.stripe_events")).rows.length, 0);
  await assert.rejects(
    asUser(HOMEOWNER, `insert into public.stripe_events (id, type, livemode) values ('evt_x', 'x', false)`),
    /row-level security/,
  );
});

await check("0013 stripe_events: anon sees no rows and cannot write", async () => {
  await db.exec("set role anon;");
  try {
    assert.equal((await db.query("select id from public.stripe_events")).rows.length, 0);
    await assert.rejects(
      db.query(`insert into public.stripe_events (id, type, livemode) values ('evt_anon', 'x', false)`),
      /permission denied|row-level security/,
    );
  } finally {
    await db.exec("reset role;");
  }
});

await check("0013 stripe_events: service role inserts; duplicate event id is refused", async () => {
  await db.exec(`insert into public.stripe_events (id, type, livemode) values ('evt_test_dup', 'checkout.session.completed', false)`);
  await assert.rejects(
    db.exec(`insert into public.stripe_events (id, type, livemode) values ('evt_test_dup', 'checkout.session.completed', false)`),
    /duplicate key/,
  );
});

// Split constraint: payout + commission must equal the amount actually charged.
// Diagnostic-credit case: RD$6,000 quote, RD$750 diagnostic credited, RD$5,250 charged.
// Commission at 12% on the charged amount: 630. Pro payout: 4,620.
await check("0013 split: diagnostic-credit repair charged RD$5,250 is accepted", async () => {
  await db.exec("begin;");
  try {
    await db.exec(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                     amount_dop, commission_dop, pro_payout_dop, purpose, status)
                   values ('${JOB}', 'stripe', 'USD', 8750, 60, 5250, 630, 4620, 'job', 'held')`);
  } finally {
    await db.exec("rollback;");
  }
});

await check("0013 split: charging the quote (RD$6,000) with the credited split is refused", async () => {
  await db.exec("begin;");
  try {
    await assert.rejects(
      db.exec(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                 amount_dop, commission_dop, pro_payout_dop, purpose, status)
               values ('${JOB}', 'stripe', 'USD', 10000, 60, 6000, 630, 4620, 'job', 'held')`),
      /payments_split_consistent/,
    );
  } finally {
    await db.exec("rollback;");
  }
});

// Diagnostic RD$750 at 15%, minimum waived: 112.5 rounds half-up to 113. Payout 637.
await check("0013 split: diagnostic RD$750 at 15% (commission 113) is accepted", async () => {
  await db.exec("begin;");
  try {
    await db.exec(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                     amount_dop, commission_dop, pro_payout_dop, purpose, status)
                   values ('${JOB}', 'stripe', 'USD', 1250, 60, 750, 113, 637, 'diagnostic', 'held')`);
  } finally {
    await db.exec("rollback;");
  }
});

// 0014 · Diagnostic credit link and webhook apply.
const { randomUUID } = await import("node:crypto");

async function withRollback(fn) {
  await db.exec("begin;");
  try {
    await fn();
  } finally {
    await db.exec("rollback;");
  }
}

// Paid diagnostic (RD$750, 113 commission, 637 payout) and accepted repair (RD$6,000 quote).
async function seedCreditPair() {
  return asOwner(HOMEOWNER, async () => {
  const { trade } = (await db.query(`select trade from public.pros where id = '${PRO}'`)).rows[0];
  const diag = randomUUID();
  const repair = randomUUID();
  const quote = randomUUID();
  await db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status)
                 values ('${diag}', '${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Diagnóstico de prueba.', 'accepted', 'diagnostic', 'paid')`);
  await db.exec(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                   amount_dop, commission_dop, pro_payout_dop, purpose, status)
                 values ('${diag}', 'stripe', 'USD', 1250, 60, 750, 113, 637, 'diagnostic', 'held')`);
  await db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, credit_from_job_id)
                 values ('${repair}', '${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Reparación de prueba.', 'accepted', 'repair', 'unpaid', '${diag}')`);
  await db.exec(`insert into public.quotes (id, job_id, pro_id, amount_dop, status)
                 values ('${quote}', '${repair}', '${PRO}', 6000, 'accepted')`);
  await db.exec(`update public.jobs set approved_quote_id = '${quote}' where id = '${repair}'`);
  return { diag, repair, trade };
  });
}

const applyCall = (job, { event = "evt_t1", amountDop = 5250, commission = 630, payout = 4620, sessionId = "cs_t1" } = {}) =>
  `select public.apply_stripe_checkout('${event}', 'checkout.session.completed', false, '${job}', '${sessionId}', 'pi_t1',
     'job', 8750, 60, ${amountDop}, ${commission}, ${payout}, 0) as r`;

await check("0014 link: a credit may only come from a diagnostic job", async () => {
  await withRollback(async () => {
    const { repair, trade } = await seedCreditPair();
    const other = randomUUID();
    await assert.rejects(
      asOwner(HOMEOWNER, () => db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, credit_from_job_id)
               values ('${other}', '${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Otra reparación.', 'accepted', 'repair', 'unpaid', '${repair}')`)),
      /debe venir de un diagnóstico/,
    );
  });
});

await check("0014 link: an unpaid diagnostic cannot be credited", async () => {
  await withRollback(async () => {
    const { trade } = (await db.query(`select trade from public.pros where id = '${PRO}'`)).rows[0];
    const diag = randomUUID();
    await asOwner(HOMEOWNER, () => db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status)
                   values ('${diag}', '${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Diagnóstico sin pagar.', 'accepted', 'diagnostic', 'unpaid')`));
    await assert.rejects(
      asOwner(HOMEOWNER, () => db.exec(`insert into public.jobs (homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, credit_from_job_id)
               values ('${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Reparación nueva.', 'accepted', 'repair', 'unpaid', '${diag}')`)),
      /no está pagado/,
    );
  });
});

await check("0014 link: only one repair per diagnostic", async () => {
  await withRollback(async () => {
    const { diag, trade } = await seedCreditPair();
    await assert.rejects(
      asOwner(HOMEOWNER, () => db.exec(`insert into public.jobs (homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, credit_from_job_id)
               values ('${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Segunda reparación.', 'accepted', 'repair', 'unpaid', '${diag}')`)),
      /jobs_one_repair_per_diagnostic/,
    );
  });
});

await check("0014 apply: credited repair charges RD$5,250, marks the job paid", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    const r = await db.query(applyCall(repair));
    assert.equal(r.rows[0].r, "applied");
    const j = await db.query(`select payment_status from public.jobs where id = '${repair}'`);
    assert.equal(j.rows[0].payment_status, "paid");
  });
});

await check("0016 apply: the stripe event row is marked processed", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await db.query(applyCall(repair, { event: "evt_t16" }));
    const e = await db.query(`select processed_at from public.stripe_events where id = 'evt_t16'`);
    assert.notEqual(e.rows[0].processed_at, null);
  });
});

await check("0017 pros: a pro cannot set their own payout account", async () => {
  // Two guards refuse this: pros_guard_stripe_account (0017, "asigna Listavy") and
  // guard_pro_privileges (0086, "Solo un administrador..."). Postgres fires triggers in name order,
  // so the 0086 guard refuses first and its message is the one returned. The 0017 message is shadowed.
  // Refused in autocommit, so no transaction to abort. A bypass would fail the rejects check below.
  await assert.rejects(
    asUser(PRO, `update public.pros set stripe_account_id = 'acct_evil' where id = '${PRO}'`),
    /Solo un administrador puede verificar/,
  );
  const r = await db.query(`select stripe_account_id from public.pros where id = '${PRO}'`);
  assert.equal(r.rows[0].stripe_account_id, null);
});

await check("0017 release: approval starts a 24 h clock on the held payment", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await db.query(applyCall(repair, { event: "evt_r1" }));
    await db.exec(`update public.jobs set status = 'completed', approved_at = now() where id = '${repair}'`);
    const r = await db.query(
      `select extract(epoch from (p.release_after - j.approved_at))::int as secs
         from public.payments p join public.jobs j on j.id = p.job_id
        where p.job_id = '${repair}' and p.purpose = 'job'`,
    );
    assert.equal(r.rows[0].secs, 86400);
  });
});

await check("0017 release: claim returns a payment only after its 24 h window", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await db.query(applyCall(repair, { event: "evt_r2" }));
    await db.exec(`update public.jobs set status = 'completed', approved_at = now() where id = '${repair}'`);
    const early = await db.query(`select count(*)::int as n from public.claim_due_payments() where job_id = '${repair}'`);
    assert.equal(early.rows[0].n, 0);
    await db.exec(`update public.payments set release_after = now() - interval '1 hour' where job_id = '${repair}' and purpose = 'job'`);
    const due = await db.query(`select count(*)::int as n from public.claim_due_payments() where job_id = '${repair}'`);
    assert.equal(due.rows[0].n, 1);
  });
});

await check("0017 release: a payment is marked released once", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await db.query(applyCall(repair, { event: "evt_r3" }));
    const pid = (await db.query(`select id from public.payments where job_id = '${repair}' and purpose = 'job'`)).rows[0].id;
    assert.equal((await db.query(`select public.mark_payment_released('${pid}', 'tr_test1') as r`)).rows[0].r, "released");
    assert.equal((await db.query(`select public.mark_payment_released('${pid}', 'tr_test1') as r`)).rows[0].r, "skipped");
    const p = await db.query(`select status, stripe_transfer_id from public.payments where id = '${pid}'`);
    assert.equal(p.rows[0].status, "released");
    assert.equal(p.rows[0].stripe_transfer_id, "tr_test1");
  });
});

await check("0017 release: signed-in users cannot claim or mark payments", async () => {
  await assert.rejects(asUser(HOMEOWNER, `select * from public.claim_due_payments()`), /permission denied/);
  await assert.rejects(asUser(HOMEOWNER, `select public.mark_payment_released('${randomUUID()}', 'tr_x')`), /permission denied/);
});

await check("0014 apply: a repeated Stripe event id is a no-op", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await db.query(applyCall(repair));
    const again = await db.query(applyCall(repair));
    assert.equal(again.rows[0].r, "duplicate");
  });
});

await check("0014 apply: charging the full quote (RD$6,000) with a credit is refused", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await assert.rejects(
      db.query(applyCall(repair, { amountDop: 6000, commission: 720, payout: 5280, event: "evt_t2", sessionId: "cs_t2" })),
      /no coincide/,
    );
  });
});

await check("0014 apply: a split that does not add up is refused by the table", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await assert.rejects(
      db.query(applyCall(repair, { commission: 600, event: "evt_t3", sessionId: "cs_t3" })),
      /payments_split_consistent/,
    );
  });
});

await check("0014 apply: a failed apply leaves no event row, so Stripe can retry", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    // Each webhook call is its own transaction. A savepoint stands in for that here.
    await db.exec("savepoint apply_attempt;");
    await assert.rejects(db.query(applyCall(repair, { amountDop: 6000, commission: 720, payout: 5280, event: "evt_t4", sessionId: "cs_t4" })), /no coincide/);
    await db.exec("rollback to savepoint apply_attempt;");
    const left = await db.query(`select id from public.stripe_events where id = 'evt_t4'`);
    assert.equal(left.rows.length, 0);
  });
});

await check("0014 apply: signed-in users and anon have no EXECUTE on it", async () => {
  const sig = "public.apply_stripe_checkout(text,text,boolean,uuid,text,text,text,bigint,numeric,integer,integer,integer,integer)";
  const r = await db.query(`select has_function_privilege('authenticated', '${sig}', 'EXECUTE') as auth,
                                   has_function_privilege('anon', '${sig}', 'EXECUTE') as anon,
                                   has_function_privilege('service_role', '${sig}', 'EXECUTE') as svc`);
  assert.deepEqual(r.rows[0], { auth: false, anon: false, svc: true });
});

// 0018 · Refunds slice 1: cancellation, automatic refund rows, processor functions.
// Rejections run outside withRollback: a failed statement aborts the whole transaction.
async function seedHeldJob({ status = "accepted", held = true } = {}) {
  return asOwner(HOMEOWNER, async () => {
  const job = randomUUID();
  await db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status)
                 values ('${job}', '${HOMEOWNER}', '${PRO}', 'plumber', 'Naco', 'Reembolso de prueba.', '${status}', 'repair', '${held ? "paid" : "unpaid"}')`);
  let payment = null;
  if (held) {
    payment = randomUUID();
    await db.exec(`insert into public.payments (id, job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                     amount_dop, commission_dop, pro_payout_dop, purpose, status)
                   values ('${payment}', '${job}', 'stripe', 'USD', 10000, 60, 6000, 720, 5280, 'job', 'held')`);
  }
  return { job, payment };
  });
}

await check("0018 cancel: client cancels an accepted unpaid job with no refund", async () => {
  await withRollback(async () => {
    const { job } = await seedHeldJob({ held: false });
    const r = await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner') as r`);
    assert.equal(r.rows[0].r, "cancelled");
    const rf = await db.query(`select id from public.refunds where job_id = '${job}'`);
    assert.equal(rf.rows.length, 0);
  });
});

await check("0018 cancel: client cancels a held job and a full refund is queued", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    const r = await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner') as r`);
    assert.equal(r.rows[0].r, "refund_pending");
    const rf = await db.query(`select payment_id, amount_minor, amount_dop, reason, status from public.refunds where job_id = '${job}'`);
    assert.deepEqual(rf.rows[0], { payment_id: payment, amount_minor: 10000, amount_dop: 6000, reason: "client_cancel_pre_work", status: "pending" });
    const j = await db.query(`select status from public.jobs where id = '${job}'`);
    assert.equal(j.rows[0].status, "cancelled");
  });
});

await check("0018 cancel: pro cancel queues a refund and records a strike", async () => {
  await withRollback(async () => {
    const { job } = await seedHeldJob();
    const r = await asUser(PRO, `select public.cancel_job_with_refund('${job}', 'pro') as r`);
    assert.equal(r.rows[0].r, "refund_pending");
    const rf = await db.query(`select reason from public.refunds where job_id = '${job}'`);
    assert.equal(rf.rows[0].reason, "pro_cancel");
    const s = await db.query(`select reason from public.pro_strikes where job_id = '${job}' and pro_id = '${PRO}'`);
    assert.equal(s.rows[0].reason, "pro_cancel");
  });
});

await check("0018 cancel: the wrong party cannot cancel", async () => {
  const { job } = await seedHeldJob();
  await assert.rejects(asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'pro')`), /Solo el profesional/);
  await assert.rejects(asUser(OUTSIDER_PRO, `select public.cancel_job_with_refund('${job}', 'pro')`), /Solo el profesional/);
  await assert.rejects(asUser(PRO, `select public.cancel_job_with_refund('${job}', 'homeowner')`), /Solo el cliente/);
});

await check("0018 cancel: a repeat cancel on a cancelled job is a no-op (no second refund)", async () => {
  await withRollback(async () => {
    const { job } = await seedHeldJob();
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    const again = await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner') as r`);
    assert.equal(again.rows[0].r, "cancelled");
    const rf = await db.query(`select id from public.refunds where job_id = '${job}'`);
    assert.equal(rf.rows.length, 1, "one refund only");
  });
});

await check("0018 cancel: a job in progress cannot be cancelled here", async () => {
  const { job } = await seedHeldJob({ status: "in_progress" });
  await assert.rejects(asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`), /no se puede cancelar/);
});

await check("0018 refunds: only one open or succeeded refund per payment", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await assert.rejects(
      db.exec(`insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason)
               values ('${payment}', '${job}', 6000, 10000, 'pro_cancel')`),
      /refunds_one_per_payment/,
    );
  });
});

await check("0018 processor: claim, then mark succeeded moves payment and job to refunded", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    const claimed = await db.query(`select * from public.claim_pending_refunds(50)`);
    const mine = claimed.rows.find((c) => c.payment_id === payment);
    assert.ok(mine, "refund should be claimable");
    const first = await db.query(`select public.mark_refund_succeeded('${mine.refund_id}', 're_test_1') as r`);
    assert.equal(first.rows[0].r, "succeeded");
    const p = await db.query(`select status, refunded_minor from public.payments where id = '${payment}'`);
    assert.deepEqual(p.rows[0], { status: "refunded", refunded_minor: 10000 });
    const j = await db.query(`select payment_status from public.jobs where id = '${job}'`);
    assert.equal(j.rows[0].payment_status, "refunded");
    const again = await db.query(`select public.mark_refund_succeeded('${mine.refund_id}', 're_test_1') as r`);
    assert.equal(again.rows[0].r, "skipped");
  });
});

await check("0018 processor: service-only access to claim and mark", async () => {
  await assert.rejects(asUser(HOMEOWNER, `select * from public.claim_pending_refunds(5)`), /permission denied/);
  await assert.rejects(asUser(PRO, `select public.mark_refund_succeeded('${randomUUID()}', 're_x')`), /permission denied/);
});

await check("0018 refunds: signed-in users see no refund or strike rows", async () => {
  const { job: strikeJob } = await seedHeldJob();
  await db.exec(`insert into public.pro_strikes (pro_id, job_id, reason) values ('${PRO}', '${strikeJob}', 'pro_cancel')`);
  await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${strikeJob}', 'homeowner')`);
  const total = await db.query(`select (select count(*) from public.refunds) as r, (select count(*) from public.pro_strikes) as s`);
  assert.ok(Number(total.rows[0].r) > 0 && Number(total.rows[0].s) > 0, "fixtures should exist");
  const asHomeowner = await asUser(HOMEOWNER, `select id from public.refunds`);
  assert.equal(asHomeowner.rows.length, 0);
  const asPro = await asUser(PRO, `select id from public.pro_strikes`);
  assert.equal(asPro.rows.length, 0);
});

// 0019 · Disputes and guarantee reserve (D1, D4). Rejections run outside withRollback.
async function seedJobPayment({ status = "held", approvedHoursAgo = 1 } = {}) {
  return asOwner(HOMEOWNER, async () => {
  const job = randomUUID();
  const payment = randomUUID();
  await db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, approved_at)
                 values ('${job}', '${HOMEOWNER}', '${PRO}', 'plumber', 'Naco', 'Disputa de prueba.', 'completed', 'repair', 'paid',
                         now() - interval '${approvedHoursAgo} hours')`);
  await db.exec(`insert into public.payments (id, job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                   amount_dop, commission_dop, pro_payout_dop, purpose, status, release_after)
                 values ('${payment}', '${job}', 'stripe', 'USD', 10000, 60, 6000, 720, 5280, 'job', '${status}',
                         now() - interval '${approvedHoursAgo} hours' + interval '24 hours')`);
  return { job, payment };
  });
}

await check("0019 open: a pre-release dispute freezes the payment", async () => {
  const { job, payment } = await seedJobPayment({ approvedHoursAgo: 1 });
  const r = await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente') as r`);
  assert.equal(r.rows[0].r, "open");
  const p = await db.query(`select status from public.payments where id = '${payment}'`);
  assert.equal(p.rows[0].status, "disputed");
  await assert.rejects(asUser(PRO, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`), /Ya hay una disputa/);
});

await check("0019 open: a stranger cannot open a dispute", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await assert.rejects(asUser(OUTSIDER_PRO, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`), /Solo las partes/);
});

await check("0019 open: nothing can be disputed after 48 h", async () => {
  const { job } = await seedJobPayment({ status: "released", approvedHoursAgo: 49 });
  await assert.rejects(asUser(HOMEOWNER, `select public.open_dispute('${job}', true, 'La fuga regresó al día siguiente')`), /48 horas/);
});

await check("0019 open: after release only a latent defect is accepted", async () => {
  const { job } = await seedJobPayment({ status: "released", approvedHoursAgo: 30 });
  await assert.rejects(asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`), /solo se acepta un defecto latente/);
  const ok = await asUser(HOMEOWNER, `select public.open_dispute('${job}', true, 'La fuga regresó al día siguiente') as r`);
  assert.equal(ok.rows[0].r, "open");
});

await check("0019 claim: a disputed payment is not released", async () => {
  const { payment } = await seedJobPayment({ approvedHoursAgo: 30 });
  await db.exec(`update public.payments set status = 'disputed' where id = '${payment}'`);
  const due = await db.query(`select payment_id from public.claim_due_payments(200)`);
  assert.equal(due.rows.some((x) => x.payment_id === payment), false);
  await db.exec(`update public.payments set status = 'held' where id = '${payment}'`);
});

await check("0019 outcome: release_full returns a frozen payment to held", async () => {
  const { job, payment } = await seedJobPayment({ approvedHoursAgo: 1 });
  const d = await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente') as r`);
  assert.equal(d.rows[0].r, "open");
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'release_full', null, 'Motivo de la decisión de prueba')`);
  const p = await db.query(`select status from public.payments where id = '${payment}'`);
  assert.equal(p.rows[0].status, "held");
});

await check("0019 outcome: release_full sets the legacy status and redo keeps the dispute open", async () => {
  const a = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${a.job}', false, 'La fuga regresó al día siguiente')`);
  const da = await db.query(`select id from public.disputes where job_id = '${a.job}' and status = 'open'`);
  await closeWindows();
  await db.query(`select public.resolve_dispute('${da.rows[0].id}', 'release_full', null, 'Motivo de la decisión de prueba')`);
  const sa = await db.query(`select status, resolved_at is not null as done from public.disputes where id = '${da.rows[0].id}'`);
  assert.deepEqual(sa.rows[0], { status: "resolved_pro", done: true });

  const b = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${b.job}', false, 'El trabajo quedó mal hecho')`);
  const db2 = await db.query(`select id from public.disputes where job_id = '${b.job}' and status = 'open'`);
  await closeWindows();
  const r = await db.query(`select public.resolve_dispute('${db2.rows[0].id}', 'redo', null, 'Motivo de la decisión de prueba') as r`);
  assert.equal(r.rows[0].r, "redo_pending");
  const sb = await db.query(`select status, outcome, resolved_at from public.disputes where id = '${db2.rows[0].id}'`);
  assert.deepEqual(sb.rows[0], { status: "open", outcome: "redo", resolved_at: null });
  const pb = await db.query(`select status from public.payments where id = '${b.payment}'`);
  assert.equal(pb.rows[0].status, "disputed");
});

await check("0019 outcome: full_refund queues a dispute refund and marks the payment refunded", async () => {
  const { job, payment } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'full_refund', null, 'Motivo de la decisión de prueba')`);
  const rf = await db.query(`select id, reason, amount_minor, status from public.refunds where payment_id = '${payment}'`);
  assert.equal(rf.rows[0].reason, "dispute_full");
  assert.equal(rf.rows[0].status, "pending");
  await db.query(`select public.mark_refund_succeeded('${rf.rows[0].id}', 're_dispute_full')`);
  const p = await db.query(`select status from public.payments where id = '${payment}'`);
  assert.equal(p.rows[0].status, "refunded");
});

await check("0019 outcome: partial refund splits the payment, commission on the kept portion only", async () => {
  const { job, payment } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await assert.rejects(db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'partial_refund', 0, 'Motivo de la decisión de prueba')`), /mayor que cero/);
  await closeWindows();
  await assert.rejects(db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'partial_refund', 6000, 'Motivo de la decisión de prueba')`), /menor que el monto/);
  await closeWindows();
  await db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'partial_refund', 4000, 'Motivo de la decisión de prueba')`);
  const p = await db.query(`select keep_dop, keep_minor, keep_pro_payout_dop, keep_commission_dop, status from public.payments where id = '${payment}'`);
  assert.deepEqual(p.rows[0], { keep_dop: 2000, keep_minor: 3333, keep_pro_payout_dop: 1600, keep_commission_dop: 400, status: "disputed" });
  const rf = await db.query(`select id, amount_minor, amount_dop from public.refunds where payment_id = '${payment}'`);
  assert.equal(rf.rows[0].amount_dop, 4000);
  assert.equal(Number(rf.rows[0].amount_minor), 6667);
  await db.query(`select public.mark_refund_succeeded('${rf.rows[0].id}', 're_dispute_partial')`);
  const after = await db.query(`select status from public.payments where id = '${payment}'`);
  assert.equal(after.rows[0].status, "held");
  await db.exec(`update public.payments set release_after = now() - interval '1 minute' where id = '${payment}'`);
  const due = await db.query(`select amount_minor, amount_dop, pro_payout_dop from public.claim_due_payments(200) where payment_id = '${payment}'`);
  assert.deepEqual(due.rows[0], { amount_minor: 3333, amount_dop: 2000, pro_payout_dop: 1600 });
});

await check("0019 guarantee: a post-release refund is refused while the reserve is empty", async () => {
  const { job } = await seedJobPayment({ status: "released", approvedHoursAgo: 30 });
  await asUser(PRO, `select public.open_dispute('${job}', true, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await assert.rejects(db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'full_refund', null, 'Motivo de la decisión de prueba')`), /Reserva de garantía insuficiente/);
});

await check("0019 guarantee: a funded reserve pays the refund and records the recovery", async () => {
  // Earlier checks may fund the reserve on release, so compare against the balance at the start.
  const start = await db.query(`select coalesce(sum(case when entry_kind = 'funding' then amount_dop else -amount_dop end), 0) as b from public.guarantee_reserve`);
  const startBal = Number(start.rows[0].b);
  await db.query(`select public.record_reserve_funding(10000)`);
  const { job, payment } = await seedJobPayment({ status: "released", approvedHoursAgo: 30 });
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', true, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'full_refund', null, 'Motivo de la decisión de prueba')`);
  const rf = await db.query(`select id, reason, amount_dop from public.refunds where payment_id = '${payment}'`);
  assert.equal(rf.rows[0].reason, "guarantee_refund");
  assert.equal(rf.rows[0].amount_dop, 6000);
  const rec = await db.query(`select pro_id, amount_dop, status from public.pro_recoveries where dispute_id = '${disp.rows[0].id}'`);
  assert.deepEqual(rec.rows[0], { pro_id: PRO, amount_dop: 6000, status: "owed" });
  await db.query(`select public.mark_refund_succeeded('${rf.rows[0].id}', 're_guarantee')`);
  const p = await db.query(`select status, refunded_minor from public.payments where id = '${payment}'`);
  assert.deepEqual(p.rows[0], { status: "released", refunded_minor: 10000 });
  const bal = await db.query(`select coalesce(sum(case when entry_kind = 'funding' then amount_dop else -amount_dop end), 0) as b from public.guarantee_reserve`);
  assert.equal(Number(bal.rows[0].b) - startBal, 4000);
});

await check("0019 guarantee: a post-release refund cannot exceed the job amount", async () => {
  const { job } = await seedJobPayment({ status: "released", approvedHoursAgo: 30 });
  await asUser(PRO, `select public.open_dispute('${job}', true, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await assert.rejects(db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'partial_refund', 7000, 'Motivo de la decisión de prueba')`), /excede el monto/);
});

await check("0019 access: signed-in users cannot resolve disputes or fund the reserve", async () => {
  await assert.rejects(asUser(HOMEOWNER, `select public.resolve_dispute('${randomUUID()}', 'redo', null, 'Motivo de la decisión de prueba')`), /permission denied|Solo el administrador/);
  await assert.rejects(asUser(HOMEOWNER, `select public.record_reserve_funding(1)`), /permission denied/);
});

await check("0019 access: parties cannot insert or update disputes directly", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await assert.rejects(
    asUser(HOMEOWNER, `insert into public.disputes (job_id, opened_by, reason) values ('${job}', '${HOMEOWNER}', 'Inserción directa')`),
    /permission denied|row-level security/,
  );
  // The test setup re-grants table privileges after migrations, so RLS is what stops this update.
  // In production the revoke above applies, and the update is refused outright.
  await asUser(ADMIN, `update public.disputes set status = 'resolved_pro' where job_id = '${job}'`).catch(() => {});
  const still = await db.query(`select status from public.disputes where job_id = '${job}'`);
  assert.equal(still.rows.length, 0);
});

await check("0019 access: reserve and recovery rows are not visible to signed-in users", async () => {
  const total = await db.query(`select (select count(*) from public.guarantee_reserve) as g, (select count(*) from public.pro_recoveries) as r`);
  assert.ok(Number(total.rows[0].g) > 0 && Number(total.rows[0].r) > 0);
  assert.equal((await asUser(PRO, `select id from public.guarantee_reserve`)).rows.length, 0);
  assert.equal((await asUser(PRO, `select id from public.pro_recoveries`)).rows.length, 0);
});

await check("0020 admin: an admin reads the reserve ledger and recoveries; pros and homeowners do not", async () => {
  const total = await db.query(`select (select count(*) from public.guarantee_reserve) as g, (select count(*) from public.pro_recoveries) as r`);
  assert.ok(Number(total.rows[0].g) > 0 && Number(total.rows[0].r) > 0);
  assert.ok((await asUser(ADMIN, `select id from public.guarantee_reserve`)).rows.length > 0);
  assert.ok((await asUser(ADMIN, `select id from public.pro_recoveries`)).rows.length > 0);
  assert.equal((await asUser(HOMEOWNER, `select id from public.guarantee_reserve`)).rows.length, 0);
  assert.equal((await asUser(PRO, `select id from public.pro_recoveries`)).rows.length, 0);
});

await check("0020 admin: reserve and recoveries stay read-only for admins", async () => {
  await assert.rejects(asUser(ADMIN, `insert into public.guarantee_reserve (entry_kind, amount_dop) values ('funding', 1)`), /permission denied|row-level security/);
  // RLS filters the update to zero rows here. Production also revokes the update privilege.
  await asUser(ADMIN, `update public.pro_recoveries set status = 'settled'`).catch(() => {});
  const owed = await db.query(`select count(*) as n from public.pro_recoveries where status = 'owed'`);
  assert.ok(Number(owed.rows[0].n) > 0);
});

await check("0021 release: funds 10% of the retained commission", async () => {
  const { payment } = await seedJobPayment({ status: "held", approvedHoursAgo: 1 });
  assert.equal((await db.query(`select public.mark_payment_released('${payment}', 'tr_0021a') as r`)).rows[0].r, "released");
  const g = await db.query(`select amount_dop from public.guarantee_reserve where payment_id = '${payment}' and entry_kind = 'funding'`);
  assert.equal(g.rows.length, 1);
  assert.equal(g.rows[0].amount_dop, 72); // 10% of the 720 commission in the fixture
});

await check("0021 release: a repeat release adds no second funding row", async () => {
  const { payment } = await seedJobPayment({ status: "held", approvedHoursAgo: 1 });
  await db.query(`select public.mark_payment_released('${payment}', 'tr_0021b')`);
  assert.equal((await db.query(`select public.mark_payment_released('${payment}', 'tr_0021b') as r`)).rows[0].r, "skipped");
  const g = await db.query(`select count(*) as n from public.guarantee_reserve where payment_id = '${payment}' and entry_kind = 'funding'`);
  assert.equal(Number(g.rows[0].n), 1);
});

await check("0021 release: a partial split funds 10% of the kept commission only", async () => {
  const { job, payment } = await seedJobPayment({ status: "held", approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'partial_refund', 4000, 'Motivo de la decisión de prueba')`);
  const rf = await db.query(`select id from public.refunds where payment_id = '${payment}'`);
  await db.query(`select public.mark_refund_succeeded('${rf.rows[0].id}', 're_0021_partial')`);
  await db.query(`select public.mark_payment_released('${payment}', 'tr_0021c')`);
  const g = await db.query(`select amount_dop from public.guarantee_reserve where payment_id = '${payment}' and entry_kind = 'funding'`);
  assert.equal(g.rows[0].amount_dop, 40); // 10% of the 400 kept commission (RD$400 minimum on the kept portion)
});

await check("0027 window: an admin decision before the evidence window closes is refused", async () => {
  const { job } = await seedJobPayment({ status: "held", approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await assert.rejects(
    db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'release_full', null, 'Motivo de la decisión de prueba')`),
    /aún no vence/,
  );
  const st = await db.query(`select stage from public.disputes where id = '${disp.rows[0].id}'`);
  assert.equal(st.rows[0].stage, "evidence");
});

await check("0027 evidence: a party can submit a statement; an outsider cannot", async () => {
  const { job } = await seedJobPayment({ status: "held", approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`);
  await asUser(HOMEOWNER, `select public.submit_dispute_evidence((select id from public.disputes where job_id = '${job}'), 'Hice la reparación y adjunto las fotos.')`);
  await assert.rejects(
    asUser(OUTSIDER_PRO, `select public.submit_dispute_evidence((select id from public.disputes where job_id = '${job}'), 'Yo no soy parte de este trabajo.')`),
    /Solo las partes|no encontrada|ventana/,
  );
  const n = await db.query(`select count(*)::int as n from public.dispute_evidence de join public.disputes d on d.id = de.dispute_id where d.job_id = '${job}'`);
  assert.equal(n.rows[0].n, 1);
});

await check("0029 suspension: a suspended pro cannot submit a quote; an active pro is not blocked by it", async () => {
  const quote = randomUUID();
  await db.exec(`update public.pros set suspended_at = now() where id = '${PRO}'`);
  try {
    await assert.rejects(
      asUser(PRO, `select public.submit_quote('${quote}', 1000, 'Incluye mano de obra y revisión', null, true, now(), now() + interval '2 hours', 2)`),
      /suspendida/,
    );
  } finally {
    await db.exec(`update public.pros set suspended_at = null where id = '${PRO}'`);
  }
  // Not suspended now: the gate passes and the call fails later on the unknown quote.
  await assert.rejects(
    asUser(PRO, `select public.submit_quote('${quote}', 1000, 'Incluye mano de obra y revisión', null, true, now(), now() + interval '2 hours', 2)`),
    /no es tuya/,
  );
});

await check("0021 release: a zero commission adds no funding row", async () => {
  const { payment } = await seedJobPayment({ status: "held", approvedHoursAgo: 1 });
  await db.exec(`update public.payments set commission_dop = 0, pro_payout_dop = amount_dop where id = '${payment}'`);
  assert.equal((await db.query(`select public.mark_payment_released('${payment}', 'tr_0021d') as r`)).rows[0].r, "released");
  const g = await db.query(`select count(*) as n from public.guarantee_reserve where payment_id = '${payment}'`);
  assert.equal(Number(g.rows[0].n), 0);
});

// 0022 netting checks run inside rollbacks. Other fixtures in this file leave held payments and
// owed recoveries for PRO behind, so each check first clears them, then sets up only what it needs.
async function isolateNetting() {
  await db.exec(`update public.pro_recoveries set settled_dop = amount_dop, status = 'settled' where pro_id = '${PRO}' and status = 'owed'`);
  await db.exec(`update public.payments set status = 'refunded' where status = 'held'`);
}

// A post-release partial refund creates a recovery owed by PRO of exactly refundDop.
async function makeDebt(refundDop) {
  const { job } = await seedJobPayment({ status: "released", approvedHoursAgo: 30 });
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', true, 'La fuga regresó al día siguiente')`);
  const disp = await db.query(`select id from public.disputes where job_id = '${job}' and status = 'open'`);
  await closeWindows();
  await db.query(`select public.resolve_dispute('${disp.rows[0].id}', 'partial_refund', ${refundDop}, 'Motivo de la decisión de prueba')`);
  const rec = await db.query(`select id from public.pro_recoveries where dispute_id = '${disp.rows[0].id}'`);
  return rec.rows[0].id;
}

async function seedHeldDue() {
  const { payment } = await seedJobPayment({ status: "held", approvedHoursAgo: 1 });
  await db.exec(`update public.payments set release_after = now() - interval '1 minute' where id = '${payment}'`);
  return payment;
}

await check("0022 netting: a debt larger than the payout takes the whole payout, and release is recorded", async () => {
  await withRollback(async () => {
    await isolateNetting();
    await db.query(`select public.record_reserve_funding(20000)`);
    const debt = await makeDebt(6000);
    const payment = await seedHeldDue();
    const due = await db.query(`select pro_payout_dop, net_payout_dop, recovery_dop from public.claim_due_payments(200) where payment_id = '${payment}'`);
    assert.deepEqual(due.rows[0], { pro_payout_dop: 5280, net_payout_dop: 0, recovery_dop: 5280 });
    const rec = await db.query(`select settled_dop, status from public.pro_recoveries where id = '${debt}'`);
    assert.deepEqual(rec.rows[0], { settled_dop: 5280, status: "owed" });
    assert.equal((await db.query(`select public.mark_payment_released('${payment}', null) as r`)).rows[0].r, "released");
    const p = await db.query(`select status, stripe_transfer_id from public.payments where id = '${payment}'`);
    assert.deepEqual(p.rows[0], { status: "released", stripe_transfer_id: null });
    const g = await db.query(`select amount_dop from public.guarantee_reserve where payment_id = '${payment}' and entry_kind = 'funding'`);
    assert.equal(g.rows[0].amount_dop, 72);
  });
});

await check("0022 netting: a smaller debt is cleared and the pro keeps the rest", async () => {
  await withRollback(async () => {
    await isolateNetting();
    await db.query(`select public.record_reserve_funding(20000)`);
    const debt = await makeDebt(1000);
    const payment = await seedHeldDue();
    const due = await db.query(`select net_payout_dop, recovery_dop from public.claim_due_payments(200) where payment_id = '${payment}'`);
    assert.deepEqual(due.rows[0], { net_payout_dop: 4280, recovery_dop: 1000 });
    const rec = await db.query(`select settled_dop, status from public.pro_recoveries where id = '${debt}'`);
    assert.deepEqual(rec.rows[0], { settled_dop: 1000, status: "settled" });
    const p = await db.query(`select recovery_netted_dop from public.payments where id = '${payment}'`);
    assert.equal(p.rows[0].recovery_netted_dop, 1000);
  });
});

await check("0022 netting: debts are cleared oldest first, and the remainder stays owed", async () => {
  await withRollback(async () => {
    await isolateNetting();
    await db.query(`select public.record_reserve_funding(20000)`);
    const older = await makeDebt(1000);
    const newer = await makeDebt(6000);
    await db.exec(`update public.pro_recoveries set created_at = now() - interval '2 days' where id = '${older}'`);
    const payment = await seedHeldDue();
    const due = await db.query(`select net_payout_dop, recovery_dop from public.claim_due_payments(200) where payment_id = '${payment}'`);
    assert.deepEqual(due.rows[0], { net_payout_dop: 0, recovery_dop: 5280 });
    const recs = await db.query(`select id, settled_dop, status from public.pro_recoveries where id in ('${older}', '${newer}')`);
    const byId = Object.fromEntries(recs.rows.map((r) => [r.id, r]));
    assert.deepEqual(byId[older], { id: older, settled_dop: 1000, status: "settled" });
    assert.deepEqual(byId[newer], { id: newer, settled_dop: 4280, status: "owed" });
    const d = await db.query(`select recovery_id, amount_dop from public.recovery_deductions where payment_id = '${payment}' order by amount_dop`);
    assert.deepEqual(d.rows.map((r) => [r.recovery_id, r.amount_dop]).sort(), [[older, 1000], [newer, 4280]].sort());
  });
});

await check("0022 netting: a repeat claim reuses the stored netting and deducts nothing twice", async () => {
  await withRollback(async () => {
    await isolateNetting();
    await db.query(`select public.record_reserve_funding(20000)`);
    const debt = await makeDebt(1000);
    const payment = await seedHeldDue();
    await db.query(`select * from public.claim_due_payments(200) where payment_id = '${payment}'`);
    const again = await db.query(`select net_payout_dop, recovery_dop from public.claim_due_payments(200) where payment_id = '${payment}'`);
    assert.deepEqual(again.rows[0], { net_payout_dop: 4280, recovery_dop: 1000 });
    const d = await db.query(`select count(*)::int as n from public.recovery_deductions where payment_id = '${payment}'`);
    assert.equal(d.rows[0].n, 1);
    const rec = await db.query(`select settled_dop from public.pro_recoveries where id = '${debt}'`);
    assert.equal(rec.rows[0].settled_dop, 1000);
  });
});

await check("0022 reversal: a full refund before release returns the debt to owed", async () => {
  await withRollback(async () => {
    await isolateNetting();
    await db.query(`select public.record_reserve_funding(20000)`);
    const debt = await makeDebt(1000);
    const payment = await seedHeldDue();
    await db.query(`select * from public.claim_due_payments(200) where payment_id = '${payment}'`);
    await db.exec(`update public.payments set status = 'refunded' where id = '${payment}'`);
    const rec = await db.query(`select settled_dop, status from public.pro_recoveries where id = '${debt}'`);
    assert.deepEqual(rec.rows[0], { settled_dop: 0, status: "owed" });
    const d = await db.query(`select count(*)::int as active from public.recovery_deductions where payment_id = '${payment}' and reversed_at is null`);
    assert.equal(d.rows[0].active, 0);
    const p = await db.query(`select netted_at, recovery_netted_dop from public.payments where id = '${payment}'`);
    assert.deepEqual(p.rows[0], { netted_at: null, recovery_netted_dop: 0 });
  });
});

await check("0022 reversal: a partial pre-release split re-nets on the next claim, on the kept payout", async () => {
  await withRollback(async () => {
    await isolateNetting();
    await db.query(`select public.record_reserve_funding(20000)`);
    const debt = await makeDebt(1000);
    const payment = await seedHeldDue();
    await db.query(`select * from public.claim_due_payments(200) where payment_id = '${payment}'`);
    await db.exec(`update public.payments set keep_dop = 2000, keep_minor = 3333, keep_pro_payout_dop = 1760, keep_commission_dop = 240 where id = '${payment}'`);
    const rec = await db.query(`select settled_dop, status from public.pro_recoveries where id = '${debt}'`);
    assert.deepEqual(rec.rows[0], { settled_dop: 0, status: "owed" });
    const due = await db.query(`select pro_payout_dop, net_payout_dop, recovery_dop from public.claim_due_payments(200) where payment_id = '${payment}'`);
    assert.deepEqual(due.rows[0], { pro_payout_dop: 1760, net_payout_dop: 760, recovery_dop: 1000 });
  });
});

await check("0022 reversal: a release keeps its deduction", async () => {
  await withRollback(async () => {
    await isolateNetting();
    await db.query(`select public.record_reserve_funding(20000)`);
    const debt = await makeDebt(1000);
    const payment = await seedHeldDue();
    await db.query(`select * from public.claim_due_payments(200) where payment_id = '${payment}'`);
    assert.equal((await db.query(`select public.mark_payment_released('${payment}', null) as r`)).rows[0].r, "released");
    const d = await db.query(`select count(*)::int as active from public.recovery_deductions where payment_id = '${payment}' and reversed_at is null`);
    assert.equal(d.rows[0].active, 1);
    const rec = await db.query(`select settled_dop from public.pro_recoveries where id = '${debt}'`);
    assert.equal(rec.rows[0].settled_dop, 1000);
  });
});

await check("0022 access: signed-in users cannot read the deduction ledger; admins can", async () => {
  const mine = await asUser(HOMEOWNER, `select id from public.recovery_deductions`);
  assert.equal(mine.rows.length, 0);
  await asUser(ADMIN, `select id from public.recovery_deductions`);
  await assert.rejects(asUser(ADMIN, `insert into public.recovery_deductions (payment_id, recovery_id, amount_dop) values (gen_random_uuid(), gen_random_uuid(), 1)`), /permission denied|row-level security/);
});

await check("0023 provider: jobs default to stripe and refuse an unknown provider", async () => {
  await withRollback(async () => {
    const job = randomUUID();
    await asOwner(HOMEOWNER, () => db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, payment_status)
                   values ('${job}', '${HOMEOWNER}', '${PRO}', 'plumber', 'Naco', 'Proveedor de prueba.', 'accepted', 'unpaid')`));
    const p = await db.query(`select payment_provider from public.jobs where id = '${job}'`);
    assert.equal(p.rows[0].payment_provider, "stripe");
    await assert.rejects(db.exec(`update public.jobs set payment_provider = 'azul' where id = '${job}'`), /jobs_payment_provider_known/);
  });
});

await check("0023 provider: payments refuse an unknown provider", async () => {
  await withRollback(async () => {
    const { payment } = await seedJobPayment({ approvedHoursAgo: 1 });
    const p = await db.query(`select provider from public.payments where id = '${payment}'`);
    assert.equal(p.rows[0].provider, "stripe");
    await assert.rejects(db.exec(`update public.payments set provider = 'azul' where id = '${payment}'`), /payments_provider_known/);
  });
});

await check("0023 provider: a job's provider cannot change once it has a payment", async () => {
  await withRollback(async () => {
    const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
    // Only 'stripe' is valid today. Drop the check inside this rollback to exercise the lock with a second value.
    await db.exec(`alter table public.jobs drop constraint jobs_payment_provider_known`);
    await assert.rejects(db.exec(`update public.jobs set payment_provider = 'azul' where id = '${job}'`), /proveedor de pago no puede cambiar/);
  });
});

// 0024 · Tips on Checkout. The RPC takes the tip, stores it, and enforces the 20% cap.
const applyWithTip = (job, { event, amount, commission, payout, tip }) =>
  `select public.apply_stripe_checkout('${event}', 'checkout.session.completed', false, '${job}', 'cs_${event}', 'pi_${event}',
     'job', 8750, 60, ${amount}, ${commission}, ${payout}, ${tip}) as r`;

await check("0024 tip: a tip is stored; the charge is quote minus credit plus tip; payout includes the tip", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    const r = await db.query(applyWithTip(repair, { event: "evt_tip_ok", amount: 5750, commission: 630, payout: 5120, tip: 500 }));
    assert.equal(r.rows[0].r, "applied");
    const p = await db.query(`select amount_dop, commission_dop, pro_payout_dop, tip_dop, status from public.payments where job_id = '${repair}'`);
    assert.deepEqual(p.rows[0], { amount_dop: 5750, commission_dop: 630, pro_payout_dop: 5120, tip_dop: 500, status: "held" });
  });
});

await check("0024 tip: a tip over 20% of the quote is refused", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await assert.rejects(db.query(applyWithTip(repair, { event: "evt_tip_cap", amount: 7300, commission: 630, payout: 6670, tip: 1300 })), /20 por ciento/);
  });
});

await check("0024 tip: an amount that leaves out the tip is refused", async () => {
  await withRollback(async () => {
    const { repair } = await seedCreditPair();
    await assert.rejects(db.query(applyWithTip(repair, { event: "evt_tip_mis", amount: 5250, commission: 630, payout: 4620, tip: 500 })), /no coincide/);
  });
});

// 0030 reviews v1 (spec D5) ----------------------------------------------------------
await check("0030 submit: the paying homeowner reviews a completed job; a stranger cannot", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`);
  const n = await db.query(`select count(*)::int as n from public.reviews where job_id = '${job}'`);
  assert.equal(n.rows[0].n, 1);
  const { job: other } = await seedJobPayment({ approvedHoursAgo: 1 });
  await assert.rejects(asUser(OUTSIDER_PRO, `select public.submit_review('${other}', 5, 5, 5, 5, null)`), /Solo el cliente/);
});

await check("0030 submit: under 4 stars needs 20 characters; contact details are refused", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await assert.rejects(asUser(HOMEOWNER, `select public.submit_review('${job}', 3, 3, 3, 3, 'Muy corto')`), /mínimo 20/);
  await assert.rejects(
    asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, 'Llámame al 809-555-1234 para el próximo')`),
    /No incluyas/,
  );
  await assert.rejects(
    asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, 'Mira mi perfil en www.ejemplo.com ya')`),
    /No incluyas/,
  );
});

await check("0030 submit: one review per job", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 4, 4, 4, 4, null)`);
  await assert.rejects(asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`), /Ya reseñaste/);
});

await check("0030 hold: an open dispute blocks the review form and hides the review from the public", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`);
  await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'La fuga regresó al día siguiente')`);
  const pub = await asUser(OUTSIDER_PRO, `select count(*)::int as n from public.reviews where job_id = '${job}'`);
  assert.equal(pub.rows[0].n, 0);
  const sum = await db.query(`select review_count from public.pro_review_summary('${PRO}')`);
  assert.ok(sum.rows[0].review_count >= 0);
  const { job: fresh } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.open_dispute('${fresh}', false, 'La fuga regresó al día siguiente')`);
  await assert.rejects(asUser(HOMEOWNER, `select public.submit_review('${fresh}', 5, 5, 5, 5, null)`), /disputa abierta/);
});

await check("0030 edit: allowed within 24 hours, refused after, and the pro gets one response edit", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`);
  const rv = await db.query(`select id from public.reviews where job_id = '${job}'`);
  const id = rv.rows[0].id;
  await asUser(HOMEOWNER, `select public.edit_review('${id}', 4, 4, 4, 4, null)`);
  await db.query(`update public.reviews set created_at = now() - interval '25 hours' where id = '${id}'`);
  await assert.rejects(asUser(HOMEOWNER, `select public.edit_review('${id}', 5, 5, 5, 5, null)`), /24 horas/);

  await asUser(PRO, `select public.respond_to_review('${id}', 'Gracias por confiar en nosotros.')`);
  await asUser(PRO, `select public.respond_to_review('${id}', 'Gracias de nuevo, quedó bien.')`);
  await assert.rejects(asUser(PRO, `select public.respond_to_review('${id}', 'Otra vez, no.')`), /Solo se permite una edición/);
});

await check("0030 private rating: only the pro rates the client; low average is flagged", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await assert.rejects(asUser(HOMEOWNER, `select public.submit_client_rating('${job}', 1, 1, 2)`), /Solo el profesional/);
  await asUser(PRO, `select public.submit_client_rating('${job}', 2, 1, 2)`);
  const r = await db.query(`select is_low from public.private_client_ratings where job_id = '${job}'`);
  assert.equal(r.rows[0].is_low, true);
  const visible = await asUser(HOMEOWNER, `select count(*)::int as n from public.private_client_ratings where job_id = '${job}'`);
  assert.equal(visible.rows[0].n, 0);
});

await check("0030 dispute: a full refund removes the review; the admin reason is kept", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`);
  const d = await db.query(`insert into public.disputes (job_id, opened_by, reason, status, stage)
                            values ('${job}', '${HOMEOWNER}', 'Prueba de reembolso total', 'open', 'executed') returning id`);
  await db.query(`insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, dispute_id, status)
                  select p.id, p.job_id, 6000, 10000, 'dispute_full', '${d.rows[0].id}', 'succeeded'
                    from public.payments p where p.job_id = '${job}'`);
  await db.query(`update public.disputes set stage = 'closed' where id = '${d.rows[0].id}'`);
  const rv = await db.query(`select status, status_reason from public.reviews where job_id = '${job}'`);
  assert.equal(rv.rows[0].status, "removed");
  assert.equal(rv.rows[0].status_reason, "Reembolso total por disputa");
});

await check("0030 moderation: only the admin moderates; a removal needs a reason", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`);
  const rv = await db.query(`select id from public.reviews where job_id = '${job}'`);
  await assert.rejects(asUser(OUTSIDER_PRO, `select public.moderate_review('${rv.rows[0].id}', 'remove', 'Motivo de prueba largo')`), /Solo el administrador/);
});

await check("0030 flags: a personal-data flag hides the review at once", async () => {
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`);
  const rv = await db.query(`select id from public.reviews where job_id = '${job}'`);
  await asUser(OUTSIDER_PRO, `select public.flag_review('${rv.rows[0].id}', 'personal_data')`);
  const st = await db.query(`select status from public.reviews where id = '${rv.rows[0].id}'`);
  assert.equal(st.rows[0].status, "hidden");
});

await check("0030 names: a visitor sees the reviewer as first name plus last initial, never the full name", async () => {
  await db.query(`update public.profiles set full_name = 'Ana Maria Pérez' where id = '${HOMEOWNER}'`);
  const { job } = await seedJobPayment({ approvedHoursAgo: 1 });
  await asUser(HOMEOWNER, `select public.submit_review('${job}', 5, 5, 5, 5, null)`);
  const r = await asUser(OUTSIDER_PRO, `select reviewer_name from public.list_pro_reviews('${PRO}') where job_id = '${job}'`);
  assert.equal(r.rows[0].reviewer_name, "Ana P.");
  const direct = await asUser(OUTSIDER_PRO, `select full_name from public.profiles where id = '${HOMEOWNER}'`);
  assert.equal(direct.rows.length, 0);
});

await check("0031 refunds: an admin reads refund rows; a pro does not; the trigger function is not an RPC", async () => {
  const { job, payment } = await seedJobPayment({ approvedHoursAgo: 1 });
  await db.query(`insert into public.refunds (payment_id, job_id, amount_dop, amount_minor, reason, status)
                  values ('${payment}', '${job}', 100, 100, 'client_cancel_pre_work', 'succeeded')`);
  const admin = await asUser(ADMIN, `select count(*)::int as n from public.refunds where job_id = '${job}'`);
  assert.equal(admin.rows[0].n, 1);
  const pro = await asUser(PRO, `select count(*)::int as n from public.refunds where job_id = '${job}'`);
  assert.equal(pro.rows[0].n, 0);
  await assert.rejects(
    asUser(ADMIN, `select public.sync_reviews_on_dispute_close()`),
    /permission denied/,
  );
});

// 0032 client standing (spec D5-d) ------------------------------------------------------

async function seedRatedClientJobs(client, count) {
  await db.exec(`insert into auth.users (id, phone) values ('${client}', '+1809555${String(client).slice(-4)}') on conflict do nothing`);
  await db.exec(`insert into public.profiles (id, role, full_name) values ('${client}', 'homeowner', 'Cliente Prueba') on conflict do nothing`);
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const job = randomUUID();
    const payment = randomUUID();
    await asOwner(client, () => db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, approved_at)
                   values ('${job}', '${client}', '${PRO}', 'plumber', 'Naco', 'Trabajo de prueba de calificación.', 'completed', 'repair', 'paid', now() - interval '1 hour')`));
    await db.exec(`insert into public.payments (id, job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                     amount_dop, commission_dop, pro_payout_dop, purpose, status, release_after)
                   values ('${payment}', '${job}', 'stripe', 'USD', 10000, 60, 6000, 720, 5280, 'job', 'held', now() + interval '1 day')`);
    jobs.push(job);
  }
  return jobs;
}

async function lowRateAll(jobs) {
  for (const job of jobs) {
    await asUser(PRO, `select public.submit_client_rating('${job}', 1, 1, 2)`);
  }
}

async function standing(uid) {
  const r = await asUser(uid, `select low_count, warning, blocked from public.client_standing()`);
  return r.rows[0];
}
const C_STANDING = "00000000-0000-0000-0000-000000000031";

await check("0032 standing: two low ratings give no warning; three give a warning but no block", async () => {
  const jobs = await seedRatedClientJobs(C_STANDING, 5);
  await lowRateAll(jobs.slice(0, 2));
  let st = await standing(C_STANDING);
  assert.equal(st.low_count, 2);
  assert.equal(st.warning, false);
  assert.equal(st.blocked, false);
  await lowRateAll(jobs.slice(2, 3));
  st = await standing(C_STANDING);
  assert.equal(st.low_count, 3);
  assert.equal(st.warning, true);
  assert.equal(st.blocked, false);
});
const C_BLOCK = "00000000-0000-0000-0000-000000000032";

await check("0032 block: five low ratings stop new job requests; the form refuses the insert", async () => {
  const jobs = await seedRatedClientJobs(C_BLOCK, 5);
  await lowRateAll(jobs);
  const st = await standing(C_BLOCK);
  assert.equal(st.blocked, true);
  await assert.rejects(
    asOwner(C_BLOCK, () => db.query(`insert into public.jobs (homeowner_id, trade, zone, description) values ('${C_BLOCK}', 'plumber', 'Naco', 'Nueva solicitud de prueba')`)),
    /calificaciones bajas/,
  );
});
const C_WINDOW = "00000000-0000-0000-0000-000000000033";

await check("0032 window: low ratings older than 90 days stop counting and the block lifts", async () => {
  const jobs = await seedRatedClientJobs(C_WINDOW, 5);
  await lowRateAll(jobs);
  await db.query(`update public.private_client_ratings set created_at = now() - interval '91 days' where client_id = '${C_WINDOW}'`);
  const st = await standing(C_WINDOW);
  assert.equal(st.low_count, 0);
  assert.equal(st.blocked, false);
  await asOwner(C_WINDOW, () => db.query(`insert into public.jobs (homeowner_id, trade, zone, description) values ('${C_WINDOW}', 'plumber', 'Naco', 'Nueva solicitud después de la ventana')`));
});
const C_CLEAR = "00000000-0000-0000-0000-000000000034";

await check("0032 clear: only an admin clears the count, with a reason; the block lifts and new lows count again", async () => {
  const jobs = await seedRatedClientJobs(C_CLEAR, 5);
  await lowRateAll(jobs);
  await assert.rejects(
    asUser(PRO, `select public.clear_client_rating_limit('${C_CLEAR}', 'Motivo de prueba largo')`),
    /Solo el administrador/,
  );
  await assert.rejects(
    asUser(ADMIN, `select public.clear_client_rating_limit('${C_CLEAR}', 'corto')`),
    /mínimo 10/,
  );
  await asUser(ADMIN, `select public.clear_client_rating_limit('${C_CLEAR}', 'Revisión manual del equipo')`);
  let st = await standing(C_CLEAR);
  assert.equal(st.blocked, false);
  assert.equal(st.low_count, 0);
  await asOwner(C_CLEAR, () => db.query(`insert into public.jobs (homeowner_id, trade, zone, description) values ('${C_CLEAR}', 'plumber', 'Naco', 'Nueva solicitud tras la revisión')`));
});
const C_PRIVACY = "00000000-0000-0000-0000-000000000035";

await check("0032 privacy: the client sees counts, not individual ratings", async () => {
  const r = await asUser(C_PRIVACY, `select count(*)::int as n from public.private_client_ratings where client_id = '${C_PRIVACY}'`);
  assert.equal(r.rows[0].n, 0);
});

// ---------------------------------------------------------------------------
// 0090 · Scheduling: pro calendar (owner-only), public summary, job schedule.
// ---------------------------------------------------------------------------
const S_HO = "00000000-0000-0000-0000-000000000051";
const S_OTHER = "00000000-0000-0000-0000-000000000052";
await db.exec(`insert into auth.users (id, phone) values ('${S_HO}', '+18095550051'), ('${S_OTHER}', '+18095550052')`);
const SCHED_TODAY = "(now() at time zone 'America/Santo_Domingo')::date";
let PHOTO_N = 0;
const photo = (uid) => `${uid}/sched-${++PHOTO_N}.jpg`;

/** Expected refusal inside an open transaction: a savepoint keeps the rest of the block usable. */
async function refused(run, re) {
  await db.exec("savepoint refused");
  try {
    await assert.rejects(run(), re);
  } finally {
    await db.exec("rollback to savepoint refused");
  }
}

await check("0090 hours: a pro writes own weekly hours; another pro cannot read, insert, change or delete them", async () => {
  await withRollback(async () => {
    await asUser(PRO, `insert into public.pro_weekly_hours (pro_id, weekday, enabled, start_time, end_time)
      values ('${PRO}', 1, true, '08:00', '17:00')`);
    const own = await asUser(PRO, `select count(*)::int as n from public.pro_weekly_hours where pro_id = '${PRO}'`);
    assert.equal(own.rows[0].n, 1);
    const seen = await asUser(OUTSIDER_PRO, `select count(*)::int as n from public.pro_weekly_hours where pro_id = '${PRO}'`);
    assert.equal(seen.rows[0].n, 0);
    await refused(() => asUser(OUTSIDER_PRO, `insert into public.pro_weekly_hours (pro_id, weekday, enabled, start_time, end_time)
      values ('${PRO}', 2, true, '08:00', '17:00')`), /row-level security/);
    const upd = await asUser(OUTSIDER_PRO, `update public.pro_weekly_hours set end_time = '23:00' where pro_id = '${PRO}'`);
    assert.equal(upd.affectedRows ?? upd.rowCount, 0);
    const del = await asUser(OUTSIDER_PRO, `delete from public.pro_weekly_hours where pro_id = '${PRO}'`);
    assert.equal(del.affectedRows ?? del.rowCount, 0);
    const kept = await db.query(`select end_time::text as e from public.pro_weekly_hours where pro_id = '${PRO}' and weekday = 1`);
    assert.equal(kept.rows[0].e, "17:00:00");
  });
});

await check("0090 hours: an enabled day needs a start before the end; a disabled day has no times", async () => {
  await withRollback(async () => {
    await refused(() => db.exec(`insert into public.pro_weekly_hours (pro_id, weekday, enabled, start_time, end_time)
      values ('${PRO}', 3, true, '17:00', '08:00')`), /pro_weekly_hours_range_check/);
    await refused(() => db.exec(`insert into public.pro_weekly_hours (pro_id, weekday, enabled, start_time, end_time)
      values ('${PRO}', 4, false, '08:00', '17:00')`), /pro_weekly_hours_range_check/);
  });
});

await check("0090 days off: a pro marks own days off; another pro cannot see, add or remove them", async () => {
  await withRollback(async () => {
    await asUser(PRO, `insert into public.pro_days_off (pro_id, day) values ('${PRO}', ${SCHED_TODAY} + 10)`);
    const seen = await asUser(OUTSIDER_PRO, `select count(*)::int as n from public.pro_days_off where pro_id = '${PRO}'`);
    assert.equal(seen.rows[0].n, 0);
    await refused(() => asUser(OUTSIDER_PRO, `insert into public.pro_days_off (pro_id, day) values ('${PRO}', ${SCHED_TODAY} + 11)`),
      /row-level security/);
    const del = await asUser(OUTSIDER_PRO, `delete from public.pro_days_off where pro_id = '${PRO}'`);
    assert.equal(del.affectedRows ?? del.rowCount, 0);
  });
});

await check("0090 hours and days off: a client reads neither table; anonymous access is refused", async () => {
  await withRollback(async () => {
    await asUser(PRO, `insert into public.pro_weekly_hours (pro_id, weekday, enabled, start_time, end_time)
      values ('${PRO}', 5, true, '08:00', '12:00')`);
    const client = await asUser(S_HO, `select count(*)::int as n from public.pro_weekly_hours`);
    assert.equal(client.rows[0].n, 0);
    await db.exec("savepoint anon_read");
    try {
      await db.exec("set role anon");
      // RLS gives anon no rows. A missing table privilege is also a refusal.
      const r = await db.query(`select count(*)::int as n from public.pro_weekly_hours`).catch((e) => ({ err: e }));
      if (r.err) assert.match(r.err.message, /permission denied/);
      else assert.equal(r.rows[0].n, 0);
    } finally {
      await db.exec("rollback to savepoint anon_read");
    }
  });
});

await check("0090 public summary: an approved pro shows enabled hours and today's day-off flag; a pending pro shows nothing", async () => {
  await withRollback(async () => {
    await asUser(PRO, `insert into public.pro_weekly_hours (pro_id, weekday, enabled, start_time, end_time)
      values ('${PRO}', 1, true, '08:00', '17:00'), ('${PRO}', 2, false, null, null)`);
    const open = await asUser(OUTSIDER_PRO, `select public.get_pro_schedule('${PRO}') as s`);
    assert.deepEqual(open.rows[0].s.weekly, [{ weekday: 1, start: "08:00", end: "17:00" }]);
    assert.equal(open.rows[0].s.off_today, false);
    await asUser(PRO, `insert into public.pro_days_off (pro_id, day) values ('${PRO}', ${SCHED_TODAY})`);
    const off = await asUser(OUTSIDER_PRO, `select public.get_pro_schedule('${PRO}') as s`);
    assert.equal(off.rows[0].s.off_today, true);
    const pending = await asUser(OUTSIDER_PRO, `select public.get_pro_schedule('${PENDING_PRO}') as s`);
    assert.equal(pending.rows[0].s, null);
  });
});

await check("0090 request: a dated request stores date and window; ASAP stores neither", async () => {
  const dated = await asUser(S_HO, `select public.create_job_request('plumber','Naco','${desc}','repair',
    array['${PRO2}']::uuid[], array['${photo(S_HO)}']::text[], null, 'any', ${SCHED_TODAY} + 3, 'morning') as id`);
  const d = await db.query(`select scheduled_date = ${SCHED_TODAY} + 3 as ok, scheduled_window as w from public.jobs where id = '${dated.rows[0].id}'`);
  assert.equal(d.rows[0].ok, true);
  assert.equal(d.rows[0].w, "morning");
  const asap = await asUser(S_HO, `select public.create_job_request('plumber','Naco','${desc}','repair',
    array['${PRO2}']::uuid[], array['${photo(S_HO)}']::text[], null, 'any', null, null) as id`);
  const a = await db.query(`select scheduled_date, scheduled_window from public.jobs where id = '${asap.rows[0].id}'`);
  assert.equal(a.rows[0].scheduled_date, null);
  assert.equal(a.rows[0].scheduled_window, null);
  globalThis.S_DATED_JOB = dated.rows[0].id;
});

await check("0090 request: a past date, a date over 60 days out, a date with no window, or an unknown window is refused", async () => {
  const call = (date, win) => asUser(S_HO, `select public.create_job_request('plumber','Naco','${desc}','repair',
    array['${PRO2}']::uuid[], array['${photo(S_HO)}']::text[], null, 'any', ${date}, ${win}) as id`);
  await withRollback(async () => {
    await refused(() => call(`${SCHED_TODAY} - 1`, "'morning'"), /hoy o posterior/);
    await refused(() => call(`${SCHED_TODAY} + 61`, "'morning'"), /60 días/);
    await refused(() => call(`${SCHED_TODAY} + 2`, "null"), /Elige fecha y horario/);
    await refused(() => call(`${SCHED_TODAY} + 2`, "'night'"), /Horario no válido/);
  });
});

await check("0090 request: the 60-day limit is inclusive; today is allowed", async () => {
  const edge = await asUser(S_OTHER, `select public.create_job_request('plumber','Naco','${desc}','repair',
    array['${PRO2}']::uuid[], array['${photo(S_OTHER)}']::text[], null, 'any', ${SCHED_TODAY} + 60, 'evening') as id`);
  assert.ok(edge.rows[0].id);
  const today = await asUser(S_OTHER, `select public.create_job_request('plumber','Naco','${desc}','repair',
    array['${PRO2}']::uuid[], array['${photo(S_OTHER)}']::text[], null, 'any', ${SCHED_TODAY}, 'afternoon') as id`);
  assert.ok(today.rows[0].id);
});

await check("0090 edit: only the client edits the schedule, and only while the request is 'requested'", async () => {
  const id = globalThis.S_DATED_JOB;
  await withRollback(async () => {
    await refused(() => asUser(S_OTHER, `select public.update_job_schedule('${id}', null, null)`), /Solo quien pidió/);
  });
  await asUser(S_HO, `select public.update_job_schedule('${id}', ${SCHED_TODAY} + 5, 'afternoon')`);
  const moved = await db.query(`select scheduled_window as w from public.jobs where id = '${id}'`);
  assert.equal(moved.rows[0].w, "afternoon");
  await asUser(S_HO, `select public.update_job_schedule('${id}', null, null)`);
  const asap = await db.query(`select scheduled_date as d from public.jobs where id = '${id}'`);
  assert.equal(asap.rows[0].d, null);
  await withRollback(async () => {
    await refused(() => asUser(S_HO, `select public.update_job_schedule('${id}', ${SCHED_TODAY} + 5, 'night')`), /Horario no válido/);
  });
  await db.exec(`update public.jobs set status = 'quoted' where id = '${id}'`);
  await withRollback(async () => {
    await refused(() => asUser(S_HO, `select public.update_job_schedule('${id}', ${SCHED_TODAY} + 5, 'evening')`), /ya no se puede cambiar/);
  });
});

await check("0090 lock: a direct write to the schedule is refused once the request has left 'requested'", async () => {
  const id = globalThis.S_DATED_JOB;
  await withRollback(async () => {
    await refused(() => db.exec(`update public.jobs set scheduled_window = 'evening', scheduled_date = ${SCHED_TODAY} + 6 where id = '${id}'`),
      /ya no se puede cambiar/);
  });
});

await check("0090 read: the schedule follows the job's read policy; an invited pro sees it, an uninvited pro does not", async () => {
  const id = globalThis.S_DATED_JOB;
  const invited = await asUser(PRO2, `select count(*)::int as n from public.jobs where id = '${id}'`);
  assert.equal(invited.rows[0].n, 1);
  const outsider = await asUser(OUTSIDER_PRO, `select count(*)::int as n from public.jobs where id = '${id}'`);
  assert.equal(outsider.rows[0].n, 0);
});

// ---------------------------------------------------------------------------
// 0091 · Notifications: preferences (owner-only), send log (no user access),
// senders (preference and verification gates), and transition triggers.
// ---------------------------------------------------------------------------
const N_USER = "00000000-0000-0000-0000-000000000061";
await db.exec(`insert into auth.users (id, phone) values ('${N_USER}', '+18095550061')`);

/** Counts log rows for a user, kind and status. Log rows are written by SQL here (edge calls are not run). */
async function logCount(uid, kind, status) {
  const r = await db.query(`select count(*)::int as n from public.notification_log
    where user_id = '${uid}' and kind = '${kind}' and status = '${status}'`);
  return r.rows[0].n;
}

await check("0091 preferences: both toggles default to ON; the owner edits own row; another user cannot see or change it", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.notification_preferences (user_id) values ('${N_USER}')`);
    const d = await db.query(`select job_push, job_email from public.notification_preferences where user_id = '${N_USER}'`);
    assert.equal(d.rows[0].job_push, true);
    assert.equal(d.rows[0].job_email, true);
    const own = await asUser(N_USER, `update public.notification_preferences set job_email = false where user_id = '${N_USER}'`);
    assert.equal(own.affectedRows ?? own.rowCount, 1);
    const seen = await asUser(PRO, `select count(*)::int as n from public.notification_preferences where user_id = '${N_USER}'`);
    assert.equal(seen.rows[0].n, 0);
    const other = await asUser(PRO, `update public.notification_preferences set job_push = false where user_id = '${N_USER}'`);
    assert.equal(other.affectedRows ?? other.rowCount, 0);
    // A pro cannot create a preference row for another user.
    await refused(() => asUser(PRO, `insert into public.notification_preferences (user_id) values ('${HOMEOWNER}')`), /row-level security/);
  });
});

await check("0091 log: no user or anonymous role reads the send log; only the admin reads it, through the definer function", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.notification_log (user_id, channel, kind, status) values ('${N_USER}', 'push', 'job_accepted', 'sent')`);
    // No user policy exists, so RLS hides every row. A missing table privilege is also a refusal.
    await db.exec("savepoint log_read");
    try {
      await db.exec("set role authenticated");
      await db.exec(`set request.jwt.claim.sub = '${N_USER}'`);
      const r = await db.query(`select count(*)::int as n from public.notification_log`).catch((e) => ({ err: e }));
      // 0098 adds an owner-only select policy: the owner sees exactly their own row, nothing else.
      if (r.err) assert.match(r.err.message, /permission denied/);
      else assert.equal(r.rows[0].n, 1, "the owner sees only their own log row");
    } finally {
      await db.exec("rollback to savepoint log_read");
    }
    await refused(() => asUser(PRO, `select * from public.admin_notification_log('${N_USER}', 10)`), /Solo el administrador/);
    const admin = await asUser(ADMIN, `select count(*)::int as n from public.admin_notification_log('${N_USER}', 10)`);
    assert.ok(admin.rows[0].n >= 1);
  });
});

await check("0091 push gate: a user who turned job push off gets a logged skip; an always-send kind still goes out", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.notification_preferences (user_id, job_push) values ('${N_USER}', false)`);
    await db.exec("insert into vault.decrypted_secrets (name, decrypted_secret) values ('push_secret', 'test-secret')");
    await db.exec(`select public.notify_user_push('${N_USER}', 'job_started', 'T', 'B', '/x', false)`);
    assert.equal(await logCount(N_USER, "job_started", "skipped_preference"), 1);
    await db.exec(`select public.notify_user_push('${N_USER}', 'job_started', 'T', 'B', '/x', true)`);
    assert.equal(await logCount(N_USER, "job_started", "skipped_preference"), 1);
  });
});

await check("0091 email gate: no email goes to an unverified address; the job-event email gate is separate from the always-send kinds", async () => {
  await withRollback(async () => {
    await db.exec("insert into vault.decrypted_secrets (name, decrypted_secret) values ('push_secret', 'test-secret')");
    await db.exec(`update public.profiles set email_verified_at = null where id = '${N_USER}'`);
    await db.exec(`select public.notify_user_email('${N_USER}', 'job_accepted', '{}', false, true)`);
    assert.equal(await logCount(N_USER, "job_accepted", "skipped_unverified"), 1);
    await db.exec(`select public.notify_user_email('${N_USER}', 'receipt', '{}', true, false)`);
    assert.equal(await logCount(N_USER, "receipt", "skipped_unverified"), 1);
    await db.exec(`update public.notification_preferences set job_email = false where user_id = '${N_USER}'`).catch(() => {});
    await db.exec(`insert into public.notification_preferences (user_id, job_email) values ('${N_USER}', false)
      on conflict (user_id) do update set job_email = false`);
    await db.exec(`select public.notify_user_email('${N_USER}', 'job_started', '{}', false, true)`);
    assert.equal(await logCount(N_USER, "job_started", "skipped_preference"), 1);
    await db.exec(`update public.profiles set email_verified_at = now() where id = '${N_USER}'`);
    await db.exec(`select public.notify_user_email('${N_USER}', 'receipt', '{}', true, false)`);
    assert.equal(await logCount(N_USER, "receipt", "skipped_unverified"), 1, "a verified address logs no skip");
  });
});

await check("0091 transitions: a job status change notifies once; re-saving the same status notifies nothing", async () => {
  await withRollback(async () => {
    const j = await asOwner(HOMEOWNER, () => db.query(`insert into public.jobs (homeowner_id, trade, zone, description, status)
      values ('${HOMEOWNER}', 'plumber', 'Naco', 'Transición de prueba de notificaciones', 'requested') returning id`));
    const id = j.rows[0].id;
    await db.exec(`insert into public.notification_preferences (user_id, job_push, job_email) values ('${HOMEOWNER}', false, false)
      on conflict (user_id) do update set job_push = false, job_email = false`);
    await db.exec(`update public.jobs set status = 'in_progress' where id = '${id}'`);
    const first = await logCount(HOMEOWNER, "job_started", "skipped_preference");
    assert.equal(first, 2, "one push skip and one email skip");
    await db.exec(`update public.jobs set status = 'in_progress' where id = '${id}'`);
    assert.equal(await logCount(HOMEOWNER, "job_started", "skipped_preference"), first, "re-save must not re-notify");
  });
});

await check("0091 transitions: a quote sent to the client notifies once, and a re-save does not", async () => {
  await withRollback(async () => {
    const j = await asOwner(HOMEOWNER, () => db.query(`insert into public.jobs (homeowner_id, trade, zone, description, status)
      values ('${HOMEOWNER}', 'plumber', 'Naco', 'Cotización de prueba de notificaciones', 'requested') returning id`));
    const id = j.rows[0].id;
    await db.exec(`insert into public.quotes (job_id, pro_id, status, invited_at) values ('${id}', '${PRO2}', 'invited', now())`);
    await db.exec(`insert into public.notification_preferences (user_id, job_push, job_email) values ('${HOMEOWNER}', false, false)
      on conflict (user_id) do update set job_push = false, job_email = false`);
    await db.exec(`update public.quotes set status = 'sent', amount_dop = 4000, valid_until = now() + interval '7 days' where job_id = '${id}' and pro_id = '${PRO2}'`);
    assert.equal(await logCount(HOMEOWNER, "job_quote_received", "skipped_preference"), 2);
    await db.exec(`update public.quotes set status = 'sent' where job_id = '${id}' and pro_id = '${PRO2}'`);
    assert.equal(await logCount(HOMEOWNER, "job_quote_received", "skipped_preference"), 2, "re-save must not re-notify");
  });
});

await check("0091 receipt: a successful payment sends a receipt even with every job toggle off, and only to a verified address", async () => {
  await withRollback(async () => {
    const j = await asOwner(HOMEOWNER, () => db.query(`insert into public.jobs (homeowner_id, trade, zone, description, status)
      values ('${HOMEOWNER}', 'plumber', 'Naco', 'Recibo de prueba de notificaciones', 'accepted') returning id`));
    const id = j.rows[0].id;
    await db.exec(`insert into public.notification_preferences (user_id, job_push, job_email) values ('${HOMEOWNER}', false, false)
      on conflict (user_id) do update set job_push = false, job_email = false`);
    await db.exec(`update public.profiles set email_verified_at = null where id = '${HOMEOWNER}'`);
    await db.exec(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, amount_dop, purpose, status)
      values ('${id}', 'stripe', 'DOP', 800000, 60, 8000, 'job', 'held')`);
    assert.equal(await logCount(HOMEOWNER, "receipt", "skipped_unverified"), 1, "unverified: no receipt sent");
    assert.equal(await logCount(HOMEOWNER, "receipt", "skipped_preference"), 0, "always-send ignores the toggles");
  });
});

// ---------------------------------------------------------------------------
// 0092 · Client Stripe Customers: service role only. No client reads or writes the mapping.
// The harness re-grants table privileges after migrations, so these checks assert on RLS and
// policies. The migration's revoke is reviewed in the migration itself.
// ---------------------------------------------------------------------------
const C_USER = "00000000-0000-0000-0000-000000000062";
await db.exec(`insert into auth.users (id, phone) values ('${C_USER}', '+18095550062')`);

/**
 * Runs one statement as the service role. Supabase's service_role has BYPASSRLS; this harness's
 * role does not, so the statement runs as the database owner, the same way the other service-only
 * tables are written here.
 */
async function asService(sql) {
  return db.query(sql);
}

await check("0092 customers: RLS is on and no policy grants any client a row", async () => {
  const r = await db.query(`select relrowsecurity from pg_class where oid = 'public.client_stripe_customers'::regclass`);
  assert.equal(r.rows[0].relrowsecurity, true);
  const pol = await db.query(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'client_stripe_customers'`);
  assert.equal(pol.rows[0].n, 0, "no policy: clients see no rows and write nothing");
});

await check("0092 customers: the owner cannot read or write their own Stripe customer row", async () => {
  await withRollback(async () => {
    await asService(`insert into public.client_stripe_customers (profile_id, stripe_mode, stripe_customer_id)
      values ('${C_USER}', 'test', 'cus_owner_probe')`);
    await db.exec("savepoint cust_read");
    try {
      const r = await asUser(C_USER, `select count(*)::int as n from public.client_stripe_customers`).catch((e) => ({ err: e }));
      if (r.err) assert.match(r.err.message, /permission denied/);
      else assert.equal(r.rows[0].n, 0, "the owner must see no customer rows");
    } finally {
      await db.exec("rollback to savepoint cust_read");
    }
    await db.exec("savepoint cust_write");
    try {
      await assert.rejects(
        asUser(C_USER, `insert into public.client_stripe_customers (profile_id, stripe_mode, stripe_customer_id)
          values ('${C_USER}', 'live', 'cus_owner_forged')`),
        /permission denied|row-level security/,
      );
    } finally {
      await db.exec("rollback to savepoint cust_write");
    }
  });
});

await check("0092 customers: service role keeps one row per client and mode, and the id is unique", async () => {
  await withRollback(async () => {
    await asService(`insert into public.client_stripe_customers (profile_id, stripe_mode, stripe_customer_id)
      values ('${C_USER}', 'test', 'cus_one')`);
    // The same client and mode cannot get a second row.
    await db.exec("savepoint dup_pk");
    await assert.rejects(
      asService(`insert into public.client_stripe_customers (profile_id, stripe_mode, stripe_customer_id)
        values ('${C_USER}', 'test', 'cus_two')`),
      /duplicate key/,
    );
    await db.exec("rollback to savepoint dup_pk");
    // One Stripe customer belongs to one client.
    await db.exec("savepoint dup_id");
    await assert.rejects(
      asService(`insert into public.client_stripe_customers (profile_id, stripe_mode, stripe_customer_id)
        values ('${HOMEOWNER}', 'test', 'cus_one')`),
      /duplicate key/,
    );
    await db.exec("rollback to savepoint dup_id");
    // Live and test rows for one client are separate.
    await asService(`insert into public.client_stripe_customers (profile_id, stripe_mode, stripe_customer_id)
      values ('${C_USER}', 'live', 'cus_live_one')`);
  });
});

await check("0092 customers: a non-Stripe id is refused by the format check", async () => {
  await withRollback(async () => {
    await db.exec("savepoint bad_id");
    await assert.rejects(
      asService(`insert into public.client_stripe_customers (profile_id, stripe_mode, stripe_customer_id)
        values ('${C_USER}', 'test', 'pm_not_a_customer')`),
      /check constraint/,
    );
    await db.exec("rollback to savepoint bad_id");
  });
});

// ---------------------------------------------------------------------------
// 0093 pro tools (item 7a)
// ---------------------------------------------------------------------------
const T_JOB_A = "10000000-0000-0000-0000-0000000000a1";
const T_JOB_B = "10000000-0000-0000-0000-0000000000b1";
const T_JOB_C = "10000000-0000-0000-0000-0000000000c1";

async function seedProToolJobs() {
  await seedFixture(`
    insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type) values
      ('${T_JOB_A}', '${HOMEOWNER}', '${PRO}', 'plumber', 'Naco', 'pt a', 'completed', 'repair'),
      ('${T_JOB_B}', '${HOMEOWNER}', '${PRO}', 'plumber', 'Naco', 'pt b', 'accepted', 'repair'),
      ('${T_JOB_C}', '${HOMEOWNER}', '${PRO}', 'plumber', 'Naco', 'pt c', 'accepted', 'repair');
  `);
}

await check("0093 templates: a pro saves and reads own templates; another pro and a client cannot see, edit or delete them", async () => {
  await withRollback(async () => {
    await asUser(PRO, `insert into public.pro_quote_templates (pro_id, title, amount_dop, note)
      values ('${PRO}', 'Cambio de llave', 1800, 'Incluye mano de obra')`);
    const own = await asUser(PRO, `select count(*)::int as n from public.pro_quote_templates where pro_id = '${PRO}'`);
    assert.equal(own.rows[0].n, 1);
    const other = await asUser(OUTSIDER_PRO, `select count(*)::int as n from public.pro_quote_templates where pro_id = '${PRO}'`);
    assert.equal(other.rows[0].n, 0);
    const upd = await asUser(OUTSIDER_PRO, `update public.pro_quote_templates set amount_dop = 1 where pro_id = '${PRO}'`);
    assert.equal(upd.affectedRows ?? upd.rowCount, 0);
    const del = await asUser(OUTSIDER_PRO, `delete from public.pro_quote_templates where pro_id = '${PRO}'`);
    assert.equal(del.affectedRows ?? del.rowCount, 0);
    const client = await asUser(HOMEOWNER, `select count(*)::int as n from public.pro_quote_templates`);
    assert.equal(client.rows[0].n, 0);
    await refused(() => asUser(HOMEOWNER, `insert into public.pro_quote_templates (pro_id, title, amount_dop)
      values ('${PRO}', 'x', 100)`), /row-level security/);
  });
});

await check("0093 templates: amount, title and note limits are enforced; a 21st template is refused", async () => {
  await withRollback(async () => {
    await refused(() => asUser(PRO, `insert into public.pro_quote_templates (pro_id, title, amount_dop)
      values ('${PRO}', '   ', 100)`), /check constraint/);
    await refused(() => asUser(PRO, `insert into public.pro_quote_templates (pro_id, title, amount_dop)
      values ('${PRO}', 'x', 0)`), /check constraint/);
    for (let i = 0; i < 20; i++) {
      await asUser(PRO, `insert into public.pro_quote_templates (pro_id, title, amount_dop) values ('${PRO}', 'T${i}', 100)`);
    }
    await refused(() => asUser(PRO, `insert into public.pro_quote_templates (pro_id, title, amount_dop)
      values ('${PRO}', 'T20', 100)`), /20 plantillas/);
  });
});

await check("0093 earnings: released totals split net, commission, tip and gross; held is pending and never released", async () => {
  await withRollback(async () => {
    await seedProToolJobs();
    const base = (await asUser(PRO, `select public.pro_earnings_summary() as s`)).rows[0].s;
    // Released: charged 2900 + tip 100 = amount 3000. Commission 400. Pro net = 2900 - 400 + 100 = 2600.
    await asService(`insert into public.payments (job_id, currency, amount_minor, fx_rate_dop_per_usd, status, purpose,
        amount_dop, commission_dop, pro_payout_dop, tip_dop, released_at)
      values ('${T_JOB_A}', 'USD', 5000, 60, 'released', 'job', 3000, 400, 2600, 100, now())`);
    // Held: 1000 net, not released.
    await asService(`insert into public.payments (job_id, currency, amount_minor, fx_rate_dop_per_usd, status, purpose,
        amount_dop, commission_dop, pro_payout_dop, tip_dop)
      values ('${T_JOB_B}', 'USD', 1700, 60, 'held', 'job', 1150, 150, 1000, 0)`);
    const s = (await asUser(PRO, `select public.pro_earnings_summary() as s`)).rows[0].s;
    const d = (k) => Number(s[k]) - Number(base[k]);
    assert.equal(d("this_month"), 2600);
    assert.equal(d("all_time"), 2600);
    assert.equal(d("pending"), 1000);
    assert.equal(s.monthly.length, 6);
    assert.equal(Number(s.monthly[5].amount) - Number(base.monthly[5].amount), 2600, "current month is the last bucket");
    const other = await asUser(OUTSIDER_PRO, `select public.pro_earnings_summary() as s`);
    assert.equal(Number(other.rows[0].s.all_time), 0);
  });
});

await check("0093 earnings: a client or anonymous caller is refused; owner-only grants hold", async () => {
  await withRollback(async () => {
    await refused(() => asUser(HOMEOWNER, `select public.pro_earnings_summary()`), /No autorizado/);
    await refused(() => asUser(HOMEOWNER, `select public.pro_annual_statement(2026)`), /No autorizado/);
    const g = await db.query(`select has_function_privilege('anon', 'public.pro_earnings_summary()', 'execute') as a,
      has_function_privilege('authenticated', 'public.pro_earnings_summary()', 'execute') as u`);
    assert.equal(g.rows[0].a, false);
    assert.equal(g.rows[0].u, true);
  });
});

await check("0093 statement: released payments only, one year, with pending kept out of totals", async () => {
  await withRollback(async () => {
    await seedProToolJobs();
    const yr = await asUser(PRO, `select extract(year from now() at time zone 'America/Santo_Domingo')::int as y`);
    const year = yr.rows[0].y;
    const before = (await asUser(PRO, `select public.pro_annual_statement(${year}) as s`)).rows[0].s;
    await asService(`insert into public.payments (job_id, currency, amount_minor, fx_rate_dop_per_usd, status, purpose,
        amount_dop, commission_dop, pro_payout_dop, tip_dop, released_at)
      values ('${T_JOB_A}', 'USD', 5000, 60, 'released', 'job', 3000, 400, 2600, 100, now())`);
    await asService(`insert into public.payments (job_id, currency, amount_minor, fx_rate_dop_per_usd, status, purpose,
        amount_dop, commission_dop, pro_payout_dop, tip_dop)
      values ('${T_JOB_B}', 'USD', 1700, 60, 'held', 'job', 1150, 150, 1000, 0)`);
    const years = await asUser(PRO, `select public.pro_statement_years() as ys`);
    assert.ok(years.rows[0].ys.includes(year));
    const s = (await asUser(PRO, `select public.pro_annual_statement(${year}) as s`)).rows[0].s;
    const d = (k) => Number(s.totals[k]) - Number(before.totals[k]);
    assert.equal(d("gross"), 2900);
    assert.equal(d("commission"), 400);
    assert.equal(d("tips"), 100);
    assert.equal(d("net"), 2600);
    assert.equal(Number(s.pending) - Number(before.pending), 1000);
    assert.equal(s.lines.length - before.lines.length, 1);
    const mine = s.lines.find((l) => Number(l.gross) === 2900);
    assert.ok(mine, "the new released line is listed");
    assert.equal(Number(mine.net), 2600);
    const empty = await asUser(PRO, `select public.pro_annual_statement(2001) as s`);
    assert.equal(empty.rows[0].s.lines.length, 0);
    await refused(() => asUser(PRO, `select public.pro_annual_statement(1999)`), /Año no válido/);
  });
});

await check("0093 performance: counts, acceptance, response hours match an independent calculation; revisions and old quotes excluded", async () => {
  await withRollback(async () => {
    await seedProToolJobs();
    // Accepted: invited 1 day ago, answered 2 h later.
    await asService(`insert into public.quotes (job_id, pro_id, amount_dop, status, invited_at, responded_at)
      values ('${T_JOB_A}', '${PRO}', 2000, 'accepted', now() - interval '1 day', now() - interval '1 day' + interval '2 hours')`);
    // Rejected: answered 4 h later.
    await asService(`insert into public.quotes (job_id, pro_id, amount_dop, status, invited_at, responded_at)
      values ('${T_JOB_B}', '${PRO}', 2500, 'rejected', now() - interval '2 days', now() - interval '2 days' + interval '4 hours')`);
    // Expired invite: no response, not counted.
    await asService(`insert into public.quotes (job_id, pro_id, status, invited_at)
      values ('${T_JOB_C}', '${PRO}', 'expired', now() - interval '3 days')`);
    // Older than 90 days: other pro, not counted.
    await asService(`insert into public.quotes (job_id, pro_id, amount_dop, status, invited_at, responded_at)
      values ('${T_JOB_C}', '${OUTSIDER_PRO}', 900, 'accepted', now() - interval '120 days', now() - interval '120 days' + interval '1 hour')`);
    const s = (await asUser(PRO, `select public.pro_performance_summary() as s`)).rows[0].s;
    // Independent calculation over the same rows, straight from quotes.
    const ref = (await db.query(`
      select count(*) filter (where responded_at is not null and status in ('sent','accepted','rejected','withdrawn'))::int as submitted,
             count(*) filter (where responded_at is not null and status = 'accepted')::int as accepted,
             round((avg(extract(epoch from (responded_at - invited_at))) filter (where responded_at is not null
               and status in ('sent','accepted','rejected','withdrawn','declined'))) / 3600.0, 1) as hours
        from public.quotes where pro_id = '${PRO}' and revision_of is null and invited_at >= now() - interval '90 days'`)).rows[0];
    assert.equal(s.days, 90);
    assert.equal(s.submitted, ref.submitted);
    assert.equal(s.accepted, ref.accepted);
    assert.equal(Number(s.avg_response_hours), Number(ref.hours));
    assert.equal(s.acceptance_rate, Math.round(ref.accepted * 100 / ref.submitted));
    // The two new quotes alone: 1 accepted of 2 submitted, average (2 h + 4 h) / 2 = 3 h.
    assert.ok(ref.submitted >= 2 && ref.accepted >= 1);
  });
});

// ---- 0094 price guides -----------------------------------------------------
// Trades painter, locksmith, carpenter and blacksmith have no fixture pros, so these tests own them.

let guidePhone = 7000;
async function seedGuidePro(id, trade, min, max, { status = "approved", demo = false, closed = false } = {}) {
  guidePhone += 1;
  await seedFixture(`insert into auth.users (id, phone) values ('${id}', '+1809555${String(guidePhone).padStart(4, "0")}');
    update public.profiles set role = 'pro' where id = '${id}';`);
  await asService(`insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status, is_demo, closed_at)
    values ('${id}', '${trade}', 'Piantini', ${min}, ${max}, '${status}', ${demo}, ${closed ? "now()" : "null"})`);
}

async function guideRow(trade) {
  const r = await db.query(`select * from public.get_price_guides() where trade = '${trade}'`);
  return r.rows[0];
}

async function asAnon(sql) {
  await db.exec("set role anon;");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role;").catch(() => {});
  }
}

await check("0094 price guides: 2 pros give no range, 3 pros give a range (threshold)", async () => {
  await withRollback(async () => {
    await seedGuidePro("00000000-0000-4000-9000-000000000101", "painter", 1000, 2000);
    await seedGuidePro("00000000-0000-4000-9000-000000000102", "painter", 1500, 3000);
    const two = await guideRow("painter");
    assert.equal(two.sample, 2);
    assert.equal(two.low_dop, null);
    assert.equal(two.high_dop, null);
    await seedGuidePro("00000000-0000-4000-9000-000000000103", "painter", 2000, 4000);
    const three = await guideRow("painter");
    assert.equal(three.sample, 3);
    assert.notEqual(three.low_dop, null);
    assert.notEqual(three.high_dop, null);
  });
});

await check("0094 price guides: median of minimums and maximums, rounded to whole pesos", async () => {
  await withRollback(async () => {
    await seedGuidePro("00000000-0000-4000-9000-000000000201", "locksmith", 1000, 2000);
    await seedGuidePro("00000000-0000-4000-9000-000000000202", "locksmith", 2000, 4000);
    await seedGuidePro("00000000-0000-4000-9000-000000000203", "locksmith", 9000, 9000);
    const g = await guideRow("locksmith");
    // Minimums 1000, 2000, 9000 -> median 2000. Maximums 2000, 4000, 9000 -> median 4000.
    assert.equal(g.sample, 3);
    assert.equal(g.low_dop, 2000);
    assert.equal(g.high_dop, 4000);
  });
});

await check("0094 price guides: demo, unapproved, suspended, closed and no-range pros are excluded", async () => {
  await withRollback(async () => {
    await seedGuidePro("00000000-0000-4000-9000-000000000301", "carpenter", 1000, 2000);
    await seedGuidePro("00000000-0000-4000-9000-000000000302", "carpenter", 1000, 2000);
    await seedGuidePro("00000000-0000-4000-9000-000000000303", "carpenter", 1000, 2000);
    // Excluded: demo, pending, suspended, closed, and no stated range (max 0).
    await seedGuidePro("00000000-0000-4000-9000-000000000304", "carpenter", 1, 1, { demo: true });
    await seedGuidePro("00000000-0000-4000-9000-000000000305", "carpenter", 1, 1, { status: "pending" });
    await seedGuidePro("00000000-0000-4000-9000-000000000306", "carpenter", 1, 1, { status: "suspended" });
    await seedGuidePro("00000000-0000-4000-9000-000000000307", "carpenter", 1, 1, { closed: true });
    await seedGuidePro("00000000-0000-4000-9000-000000000308", "carpenter", 0, 0);
    const g = await guideRow("carpenter");
    assert.equal(g.sample, 3);
    assert.equal(g.low_dop, 1000);
    assert.equal(g.high_dop, 2000);
  });
});

await check("0094 price guides: anon and authenticated can call; output is aggregates only, every trade listed", async () => {
  await withRollback(async () => {
    await seedGuidePro("00000000-0000-4000-9000-000000000401", "blacksmith", 1000, 2000);
    await seedGuidePro("00000000-0000-4000-9000-000000000402", "blacksmith", 1000, 2000);
    await seedGuidePro("00000000-0000-4000-9000-000000000403", "blacksmith", 1000, 2000);
    const anon = await asAnon("select * from public.get_price_guides()");
    assert.equal(anon.rows.length, 18, "one row per active catalog trade (0109)");
    assert.deepEqual(Object.keys(anon.rows[0]).sort(), ["high_dop", "low_dop", "sample", "trade"]);
    const json = JSON.stringify(anon.rows);
    assert.ok(!json.includes("0000-4000-9000"), "no pro ids in output");
    const black = anon.rows.find((r) => r.trade === "blacksmith");
    assert.equal(black.sample, 3);
    const authed = await asUser(HOMEOWNER, "select count(*)::int as n from public.get_price_guides()");
    assert.equal(authed.rows[0].n, 18);
  });
});

// ---- 0095 promo codes -------------------------------------------------------
// Each check that seeds a job runs inside withRollback, so codes and jobs do not leak between checks.

const PROMO_NEW_CLIENT = "00000000-0000-4000-9000-000000000501";
const PROMO_REFERRER_JOB_CLIENT = "00000000-0000-4000-9000-000000000502";
let promoJobCounter = 0;

/** Accepted, unpaid job for a client with an approved quote. Fixed ids are not needed; each job is new. */
async function seedPayJob({ quote = 6000, type = "repair", client = HOMEOWNER } = {}) {
  promoJobCounter += 1;
  const job = `20000000-0000-4000-9000-${String(promoJobCounter).padStart(12, "0")}`;
  const q = `30000000-0000-4000-9000-${String(promoJobCounter).padStart(12, "0")}`;
  // Job inserts pass the suspension trigger, which needs the owner's identity (same as seedHeldJob).
  await asOwner(client, () => db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status)
    values ('${job}', '${client}', '${PRO}', 'plumber', 'Naco', 'TEST: pago con código', 'accepted', '${type}', 'unpaid')`));
  await db.exec(`insert into public.quotes (id, job_id, pro_id, amount_dop, status)
    values ('${q}', '${job}', '${PRO}', ${quote}, 'accepted')`);
  await db.exec(`update public.jobs set approved_quote_id = '${q}' where id = '${job}'`);
  return job;
}

async function seedPromoClient(id, phone) {
  await seedFixture(`insert into auth.users (id, phone) values ('${id}', '${phone}') on conflict do nothing;`);
}

async function makeCode(sql) {
  return (await asUser(ADMIN, `select public.${sql} as id`)).rows[0].id;
}

const reserve = (job, client, code) =>
  db.query(`select public.reserve_promo_code('${job}', '${client}', '${code}') as r`);

const pct = (base, p) => db.query(`select public.promo_discount_for('percent', ${p}, ${base}) as d`).then((r) => r.rows[0].d);
const fixed = (base, v) => db.query(`select public.promo_discount_for('fixed', ${v}, ${base}) as d`).then((r) => r.rows[0].d);

await check("0095 promo: client, anonymous and non-admin callers cannot read the code tables or the admin functions", async () => {
  await withRollback(async () => {
    // RLS is on with no policies: a client reads zero rows and cannot write. This holds even though the
    // harness re-grants table access after the migrations, as Supabase defaults do.
    const seen = await asUser(HOMEOWNER, `select count(*)::int as n from public.promo_codes`);
    assert.equal(seen.rows[0].n, 0);
    const seenR = await asUser(HOMEOWNER, `select count(*)::int as n from public.promo_redemptions`);
    assert.equal(seenR.rows[0].n, 0);
    await refused(() => asUser(HOMEOWNER, `insert into public.promo_codes (code, kind, value) values ('HACK1', 'percent', 100)`), /row-level security|permission denied/);
    await refused(() => asUser(HOMEOWNER, `select public.admin_list_promo_codes()`), /No autorizado/);
    await refused(() => asUser(HOMEOWNER, `select public.admin_create_promo_code('TEST1','percent',10,null,null,null,null)`), /No autorizado/);
    await refused(() => asAnon(`select public.admin_list_promo_codes()`), /permission denied/);
    await refused(() => asAnon(`select public.reserve_promo_code('${randomUUID()}', '${HOMEOWNER}', 'X')`), /permission denied/);
  });
});

await check("0095 promo: discount math rounds half up, and the client always pays at least RD$100", async () => {
  await withRollback(async () => {
    assert.equal(await pct(1005, 10), 101, "100.5 rounds up to 101");
    assert.equal(await pct(1004, 10), 100, "100.4 rounds down to 100");
    assert.equal(await pct(600, 100), 500, "100% capped so the client pays RD$100");
    assert.equal(await fixed(600, 500), 500, "fixed amount inside the cap");
    assert.equal(await fixed(550, 500), 450, "fixed amount capped at base minus RD$100");
    assert.equal(await fixed(100, 500), 0, "a base of RD$100 cannot take a code");
    assert.equal(await pct(101, 50), 1, "51 capped to 1 so the client pays RD$100");
  });
});

await check("0095 promo: an admin creates, lists and deactivates codes; codes are stored upper case; bad input is refused", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('desc10','percent',10,null,null,null,'Prueba')`);
    const code = await db.query(`select code, kind, value, active from public.promo_codes where code = 'DESC10'`);
    assert.equal(code.rows[0].code, "DESC10");
    assert.equal(code.rows[0].active, true);
    await refused(() => asUser(ADMIN, `select public.admin_create_promo_code('DESC10','percent',5,null,null,null,null)`), /ya existe/);
    await refused(() => asUser(ADMIN, `select public.admin_create_promo_code('A B','percent',5,null,null,null,null)`), /sin espacios/);
    await refused(() => asUser(ADMIN, `select public.admin_create_promo_code('PCT150','percent',150,null,null,null,null)`), /entre 1 y 100/);
    await refused(() => asUser(ADMIN, `select public.admin_create_promo_code('BADWIN','percent',5,now(),now() - interval '1 day',null,null)`), /posterior al inicio/);
    await asUser(ADMIN, `select public.admin_set_promo_active('${(await db.query(`select id from public.promo_codes where code = 'DESC10'`)).rows[0].id}', false)`);
    const list = await asUser(ADMIN, `select code, active, redeemed_count, reserved_count from public.admin_list_promo_codes() where code = 'DESC10'`);
    assert.equal(list.rows[0].active, false);
    assert.equal(list.rows[0].redeemed_count, 0);
  });
});

await check("0095 promo: a percent code reserves, the charge is discounted, commission stays on the full amount, and the split adds up", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('DESC10','percent',10,null,null,null,null)`);
    const job = await seedPayJob({ quote: 6000 });
    const preview = await asUser(HOMEOWNER, `select public.preview_promo_code('${job}', 'desc10') as p`);
    assert.equal(preview.rows[0].p.discount_dop, 600);
    // Preview reserves nothing.
    assert.equal((await db.query(`select count(*)::int as n from public.promo_redemptions where job_id = '${job}'`)).rows[0].n, 0);

    const r = await reserve(job, HOMEOWNER, "DESC10");
    assert.equal(r.rows[0].r.discount_dop, 600);
    // Charge 5,400. Commission on 6,000 at 12% = 720. Pro payout 5,280.
    await db.query(`select public.apply_stripe_checkout('evt_promo_1', 'checkout.session.completed', false, '${job}', 'cs_promo_1', 'pi_promo_1',
      'job', 9000, 60, 5400, 720, 5280, 0)`);
    const pay = (await db.query(`select amount_dop, commission_dop, pro_payout_dop, discount_dop, referral_discount_dop, promo_code_id
      from public.payments where job_id = '${job}'`)).rows[0];
    assert.equal(pay.amount_dop, 5400);
    assert.equal(pay.discount_dop, 600);
    assert.equal(pay.commission_dop, 720, "commission on the pre-discount amount");
    assert.equal(pay.pro_payout_dop + pay.commission_dop, pay.amount_dop + pay.referral_discount_dop + pay.discount_dop, "split identity");
    assert.ok(pay.promo_code_id);
    const red = (await db.query(`select status, payment_id is not null as linked from public.promo_redemptions where job_id = '${job}'`)).rows[0];
    assert.equal(red.status, "redeemed");
    assert.equal(red.linked, true);
  });
});

await check("0095 promo: a live reservation on another job gives the in-progress message; a redeemed use gives the used message", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('ENCURSO','percent',10,null,null,null,null)`);
    const first = await seedPayJob({ quote: 6000 });
    const second = await seedPayJob({ quote: 6000 });
    await reserve(first, HOMEOWNER, "ENCURSO");
    // Reservation live on job one, not paid: the second job gets the in-progress message.
    await refused(() => reserve(second, HOMEOWNER, "ENCURSO"), /Tienes un pago en curso con este código/);
    // Same code, redeemed on job one: the second job gets the used message.
    await db.query(`select public.apply_stripe_checkout('evt_curso_1', 'checkout.session.completed', false, '${first}', 'cs_curso_1', 'pi_curso_1',
      'job', 9000, 60, 5400, 720, 5280, 0)`);
    await refused(() => reserve(second, HOMEOWNER, "ENCURSO"), /Ya usaste este código/);
  });
});

await check("0095 promo: the same client cannot reuse a code on a second job", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('DESC10','percent',10,null,null,null,null)`);
    const first = await seedPayJob({ quote: 6000 });
    await reserve(first, HOMEOWNER, "DESC10");
    await db.query(`select public.apply_stripe_checkout('evt_reuse_1', 'checkout.session.completed', false, '${first}', 'cs_reuse_1', 'pi_reuse_1',
      'job', 9000, 60, 5400, 720, 5280, 0)`);
    const second = await seedPayJob({ quote: 6000 });
    await refused(() => reserve(second, HOMEOWNER, "DESC10"), /Ya usaste este código/);
  });
});

await check("0095 promo: an expired code is refused with its own message; an inactive code is refused", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('VENCIDO','fixed',500,null,now() - interval '1 day',null,null)`);
    await makeCode(`admin_create_promo_code('INACTIVO','fixed',500,null,null,null,null)`);
    await asUser(ADMIN, `select public.admin_set_promo_active('${(await db.query(`select id from public.promo_codes where code = 'INACTIVO'`)).rows[0].id}', false)`);
    const job = await seedPayJob({ quote: 6000 });
    await refused(() => reserve(job, HOMEOWNER, "VENCIDO"), /ya venció/);
    await refused(() => reserve(job, HOMEOWNER, "INACTIVO"), /no está activo/);
    await refused(() => reserve(job, HOMEOWNER, "NOEXISTE"), /no existe/);
  });
});

await check("0095 promo: a code that has not started yet is refused", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('FUTURO','fixed',500,now() + interval '2 days',null,null,null)`);
    const job = await seedPayJob({ quote: 6000 });
    await refused(() => reserve(job, HOMEOWNER, "FUTURO"), /todavía no está vigente/);
  });
});

await check("0095 promo: the usage limit counts live reservations and redemptions, and a stale reservation does not count", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('UNICO1','fixed',500,null,null,1,null)`);
    const jobA = await seedPayJob({ quote: 6000 });
    await seedPromoClient(PROMO_NEW_CLIENT, "+18095550501");
    const jobB = await seedPayJob({ quote: 6000, client: PROMO_NEW_CLIENT });
    await reserve(jobA, HOMEOWNER, "UNICO1");
    await refused(() => reserve(jobB, PROMO_NEW_CLIENT, "UNICO1"), /límite de usos/);
    // Make the first reservation stale: older than 2 hours, no payment. The limit then has room again.
    await db.query(`update public.promo_redemptions set created_at = now() - interval '3 hours' where job_id = '${jobA}'`);
    await reserve(jobB, PROMO_NEW_CLIENT, "UNICO1");
    const stale = (await db.query(`select status from public.promo_redemptions where job_id = '${jobA}'`)).rows[0].status;
    assert.equal(stale, "released", "the stale reservation is released before counting");
  });
});

await check("0095 promo: a fixed code on a RD$550 job leaves the client RD$100", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('FIJO500','fixed',500,null,null,null,null)`);
    const job = await seedPayJob({ quote: 550 });
    const r = await reserve(job, HOMEOWNER, "FIJO500");
    assert.equal(r.rows[0].r.discount_dop, 450);
  });
});

await check("0095 promo: a job of RD$100 or less cannot take a code", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('CHICO','percent',50,null,null,null,null)`);
    const job = await seedPayJob({ quote: 100 });
    await refused(() => reserve(job, HOMEOWNER, "CHICO"), /muy bajo/);
  });
});

await check("0095 promo: a code is refused when a referral discount is already recorded on the job", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('DESC10','percent',10,null,null,null,null)`);
    const job = await seedPayJob({ quote: 6000 });
    // Referral discount already recorded: charge 5,500 + 500 referral = 6,000 base. Pro 5,340, commission 660.
    await asService(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, amount_dop,
      commission_dop, pro_payout_dop, purpose, status, referral_discount_dop)
      values ('${job}', 'stripe', 'USD', 9000, 60, 5500, 660, 5340, 'job', 'held', 500)`);
    await refused(() => reserve(job, HOMEOWNER, "DESC10"), /no se puede combinar/);
  });
});

await check("0095 promo: a live promo reservation stops the referral discount, and a live referral reservation stops a promo", async () => {
  await withRollback(async () => {
    await makeCode(`admin_create_promo_code('DESC10','percent',10,null,null,null,null)`);
    await makeCode(`admin_create_promo_code('OTRO10','percent',10,null,null,null,null)`);
    await seedPromoClient(PROMO_NEW_CLIENT, "+18095550502");
    await seedPromoClient(PROMO_REFERRER_JOB_CLIENT, "+18095550503");
    await db.exec("update public.referral_settings set enabled = true");
    await db.exec(`insert into public.referrals (referrer_id, referee_id, track, status)
      values ('${PROMO_REFERRER_JOB_CLIENT}', '${PROMO_NEW_CLIENT}', 'client', 'pending')`);

    // Promo first: the referral discount is refused for that job.
    const jobA = await seedPayJob({ quote: 6000, client: PROMO_NEW_CLIENT });
    await reserve(jobA, PROMO_NEW_CLIENT, "DESC10");
    const refA = await db.query(`select public.reserve_referral_discount('${jobA}', 6000, 6000) as d`);
    assert.equal(refA.rows[0].d, 0, "promo reservation blocks the referral reserve");

    // Referral first: the promo is refused for that job (the referral row is reserved to jobB).
    const jobB = await seedPayJob({ quote: 6000, client: PROMO_NEW_CLIENT });
    const refB = await db.query(`select public.reserve_referral_discount('${jobB}', 6000, 6000) as d`);
    assert.equal(refB.rows[0].d, 500, "the friend discount applies to a job with no promo");
    await refused(() => reserve(jobB, PROMO_NEW_CLIENT, "OTRO10"), /no se puede combinar/);
  });
});

await check("0095 promo: checkout apply refuses a discounted amount when no promo reservation exists", async () => {
  await withRollback(async () => {
    const job = await seedPayJob({ quote: 6000 });
    await assert.rejects(
      db.query(`select public.apply_stripe_checkout('evt_nores', 'checkout.session.completed', false, '${job}', 'cs_nores', 'pi_nores',
        'job', 9000, 60, 5400, 720, 5280, 0)`),
      /no coincide/,
    );
  });
});

await check("0095 promo: the payment constraint rejects a split that leaves out the promo discount", async () => {
  await withRollback(async () => {
    const job = await seedPayJob({ quote: 6000 });
    await refused(() => asService(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, amount_dop,
      commission_dop, pro_payout_dop, purpose, status, discount_dop)
      values ('${job}', 'stripe', 'USD', 9000, 60, 5400, 720, 5280, 'job', 'held', 0)`).then(() => {
        throw new Error("split accepted");
      }).catch((e) => {
        if (e.message === "split accepted") throw e;
        throw e;
      }), /payments_split_consistent|check constraint/);
    await asService(`insert into public.payments (job_id, provider, currency, amount_minor, fx_rate_dop_per_usd, amount_dop,
      commission_dop, pro_payout_dop, purpose, status, discount_dop)
      values ('${job}', 'stripe', 'USD', 9000, 60, 5400, 720, 5280, 'job', 'held', 600)`);
  });
});

// ---- 0096 recurring bookings ------------------------------------------------
// Each check runs inside withRollback. A dedicated client keeps the standing cap (3 open requests)
// isolated from the shared homeowner fixture, which carries open requests from earlier checks.

const RB_CLIENT = "00000000-0000-4000-8000-0000000000e1";
await seedFixture(`insert into auth.users (id, phone) values ('${RB_CLIENT}', '+18095550077') on conflict do nothing;`);

async function rbCompletedJob(client = RB_CLIENT) {
  const id = randomUUID();
  const { trade } = (await db.query(`select trade from public.pros where id = '${PRO}'`)).rows[0];
  await asOwner(client, () => db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status)
    values ('${id}', '${client}', '${PRO}', '${trade}', 'Naco', 'Cambio de llave del baño, serie mensual de prueba.', 'completed', 'repair', 'paid')`));
  return id;
}

async function rbSeries({ due = "today+1", freq = "weekly", anchor = 1, status = "active", client = RB_CLIENT, source } = {}) {
  const src = source ?? (await rbCompletedJob(client));
  const dueSql = due === "past" ? "santo_domingo_today() - 10" : "santo_domingo_today() + 1";
  const { trade } = (await db.query(`select trade from public.pros where id = '${PRO}'`)).rows[0];
  const r = await db.query(`insert into public.recurring_bookings (client_id, pro_id, source_job_id, trade, zone, job_type, description,
      frequency, anchor, scheduled_window, status, next_due_date)
    values ('${client}', '${PRO}', '${src}', '${trade}', 'Naco', 'repair', 'Cambio de llave del baño, serie mensual de prueba.',
      '${freq}', ${anchor}, 'morning', '${status}', ${dueSql}) returning id, next_due_date::text as due`);
  return { id: r.rows[0].id, src, due: r.rows[0].due };
}

const rbRun = async () => (await db.query(`select public.run_recurring_bookings() as r`)).rows[0].r;
const rbSeriesRow = async (id) => (await db.query(`select status, paused_reason, next_due_date::text as due, occurrences, last_job_id from public.recurring_bookings where id = '${id}'`)).rows[0];
// Requests only: the completed source job shares the description prefix, so exclude it.
const rbRequestsFor = async (client) => (await db.query(`select id, scheduled_window, scheduled_date::text as sd, status from public.jobs
  where homeowner_id = '${client}' and description like 'Cambio de llave%' and status <> 'completed' order by created_at desc`)).rows;

await check("0096 recurring: date math (weekday, biweekly, monthly clamp, month end)", async () => {
  // 2026-11-19 is a Thursday (dow 4). Monday is 1.
  assert.equal((await db.query(`select public.recurring_first_due('weekly', 1, date '2026-11-19')::text as d`)).rows[0].d, "2026-11-23");
  assert.equal((await db.query(`select public.recurring_first_due('weekly', 4, date '2026-11-19')::text as d`)).rows[0].d, "2026-11-26", "same weekday goes a week out");
  assert.equal((await db.query(`select public.recurring_advance('biweekly', 1, date '2026-11-23')::text as d`)).rows[0].d, "2026-12-07");
  assert.equal((await db.query(`select public.recurring_first_due('monthly', 31, date '2026-02-10')::text as d`)).rows[0].d, "2026-02-28", "31 clamps to Feb 28");
  assert.equal((await db.query(`select public.recurring_advance('monthly', 31, date '2026-02-28')::text as d`)).rows[0].d, "2026-03-31", "anchor, not the clamped day, drives the next month");
  assert.equal((await db.query(`select public.recurring_advance('monthly', 15, date '2026-12-15')::text as d`)).rows[0].d, "2027-01-15", "year rollover");
});

await check("0096 recurring: RLS owner-only; other clients, pros and anonymous see no series; no direct writes", async () => {
  await withRollback(async () => {
    const s = await rbSeries();
    assert.equal((await asUser(RB_CLIENT, `select count(*)::int as n from public.recurring_bookings where id = '${s.id}'`)).rows[0].n, 1);
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.recurring_bookings where id = '${s.id}'`)).rows[0].n, 0, "another client");
    assert.equal((await asUser(PRO, `select count(*)::int as n from public.recurring_bookings where id = '${s.id}'`)).rows[0].n, 0, "the pro gets invitations, not series");
    // No update policy: an update matches no rows for the owner, so the status cannot change.
    await asUser(RB_CLIENT, `update public.recurring_bookings set status = 'cancelled' where id = '${s.id}'`).catch(() => {});
    assert.equal((await rbSeriesRow(s.id)).status, "active", "owner cannot change status directly");
    await refused(() => asUser(RB_CLIENT, `insert into public.recurring_bookings (client_id) values ('${RB_CLIENT}')`), /permission denied|row-level security|violates|null value/);
    await refused(() => asUser(RB_CLIENT, `select public.run_recurring_bookings()`), /permission denied/);
    await refused(() => asAnon(`select public.run_recurring_bookings()`), /permission denied/);
    await refused(() => asAnon(`select public.create_recurring_booking('${s.src}', 'weekly', 1, 'morning')`), /permission denied/);
  });
});

await check("0096 recurring: create gates (own completed job, pro approved, valid frequency/anchor/window, one live series)", async () => {
  await withRollback(async () => {
    const done = await rbCompletedJob();
    const open = randomUUID();
    await asOwner(RB_CLIENT, () => db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status)
      values ('${open}', '${RB_CLIENT}', '${PRO}', 'plumber', 'Naco', 'Cambio de llave del baño, serie mensual de prueba.', 'accepted', 'repair', 'unpaid')`));
    await refused(() => asUser(RB_CLIENT, `select public.create_recurring_booking('${open}', 'weekly', 1, 'morning')`), /solo puedes repetir un trabajo terminado/i);
    await refused(() => asUser(HOMEOWNER, `select public.create_recurring_booking('${done}', 'weekly', 1, 'morning')`), /No encontramos ese trabajo/);
    await refused(() => asUser(RB_CLIENT, `select public.create_recurring_booking('${done}', 'daily', 1, 'morning')`), /Frecuencia no válida/);
    await refused(() => asUser(RB_CLIENT, `select public.create_recurring_booking('${done}', 'weekly', 7, 'morning')`), /día de la semana/);
    await refused(() => asUser(RB_CLIENT, `select public.create_recurring_booking('${done}', 'monthly', 32, 'morning')`), /entre 1 y 31/);
    await refused(() => asUser(RB_CLIENT, `select public.create_recurring_booking('${done}', 'weekly', 1, 'night')`), /Horario no válido/);
    const id = (await asUser(RB_CLIENT, `select public.create_recurring_booking('${done}', 'monthly', 31, 'afternoon') as id`)).rows[0].id;
    assert.ok(id);
    await refused(() => asUser(RB_CLIENT, `select public.create_recurring_booking('${done}', 'weekly', 2, 'morning')`), /Ya tienes una serie/);
    // A cancelled series does not block a new one for the same job.
    await asUser(RB_CLIENT, `select public.set_recurring_booking_status('${id}', 'cancel')`);
    const again = await asUser(RB_CLIENT, `select public.create_recurring_booking('${done}', 'weekly', 2, 'morning') as id`);
    assert.ok(again.rows[0].id);
  });
});

await check("0096 recurring: generator, due in window → one request, invited pro only, date and window set, idempotent", async () => {
  await withRollback(async () => {
    const s = await rbSeries({ due: "today+1", freq: "weekly", anchor: 1 });
    const before = await rbSeriesRow(s.id);
    const out = await rbRun();
    assert.equal(out.created, 1);
    const reqs = await rbRequestsFor(RB_CLIENT);
    assert.equal(reqs.length, 1, "one request");
    assert.equal(reqs[0].status, "requested");
    assert.equal(reqs[0].sd, before.due, "scheduled date is the due date");
    assert.equal(reqs[0].scheduled_window, "morning");
    const quotes = await db.query(`select pro_id, status from public.quotes where job_id = '${reqs[0].id}'`);
    assert.deepEqual(quotes.rows.map((q) => [q.pro_id, q.status]), [[PRO, "invited"]], "only the preferred pro is invited");
    const after = await rbSeriesRow(s.id);
    assert.equal(after.occurrences, 1);
    assert.equal(after.last_job_id, reqs[0].id);
    assert.ok(after.due > before.due, "next due date advanced");
    // Second run on the same day creates nothing.
    const again = await rbRun();
    assert.equal(again.created, 0);
    assert.equal((await rbRequestsFor(RB_CLIENT)).length, 1, "still one request");
    // The structural key rejects a second occurrence for the same series and due date.
    await refused(() => db.exec(`insert into public.recurring_occurrences (series_id, due_date, outcome, job_id)
      values ('${s.id}', '${before.due}', 'created', '${reqs[0].id}')`), /unique|duplicate/);
  });
});

await check("0096 recurring: paused series creates nothing; resume recomputes a past due date; cancelled is terminal", async () => {
  await withRollback(async () => {
    const s = await rbSeries({ due: "today+1", status: "paused" });
    const out = await rbRun();
    assert.equal(out.created, 0);
    assert.equal((await rbRequestsFor(RB_CLIENT)).length, 0);
    await asUser(RB_CLIENT, `select public.set_recurring_booking_status('${s.id}', 'resume')`);
    assert.equal((await rbSeriesRow(s.id)).status, "active");
    await asUser(RB_CLIENT, `select public.set_recurring_booking_status('${s.id}', 'cancel')`);
    assert.equal((await rbSeriesRow(s.id)).status, "cancelled");
    await refused(() => asUser(RB_CLIENT, `select public.set_recurring_booking_status('${s.id}', 'resume')`), /no está pausada/);
    await refused(() => asUser(HOMEOWNER, `select public.set_recurring_booking_status('${s.id}', 'pause')`), /No encontramos esa serie/);
  });
});

await check("0096 recurring: pro no longer open → skip, auto-pause with reason, no request; resume refused while closed", async () => {
  await withRollback(async () => {
    const s = await rbSeries({ due: "today+1" });
    await asService(`update public.pros set available = false where id = '${PRO}'`);
    const out = await rbRun();
    assert.equal(out.paused, 1);
    assert.equal(out.created, 0);
    const row = await rbSeriesRow(s.id);
    assert.equal(row.status, "paused");
    assert.equal(row.paused_reason, "pro_unavailable");
    assert.equal((await rbRequestsFor(RB_CLIENT)).length, 0);
    await refused(() => asUser(RB_CLIENT, `select public.set_recurring_booking_status('${s.id}', 'resume')`), /no está disponible/);
  });
});

await check("0096 recurring: standing cap (3 open requests) → skip, advance, no request; skipped occurrence is not a created one", async () => {
  await withRollback(async () => {
    const s = await rbSeries({ due: "today+1" });
    for (let i = 0; i < 3; i++) {
      await asOwner(RB_CLIENT, () => db.exec(`insert into public.jobs (id, homeowner_id, trade, zone, description, status, job_type)
        values ('${randomUUID()}', '${RB_CLIENT}', 'plumber', 'Naco', 'Solicitud abierta de prueba para el tope.', 'requested', 'repair')`));
    }
    const before = await rbSeriesRow(s.id);
    const out = await rbRun();
    assert.equal(out.skipped_cap, 1);
    assert.equal(out.created, 0);
    const after = await rbSeriesRow(s.id);
    assert.ok(after.due > before.due, "advanced past the skipped date");
    assert.equal(after.occurrences, 0);
    const occ = await db.query(`select outcome, job_id from public.recurring_occurrences where series_id = '${s.id}'`);
    assert.deepEqual(occ.rows.map((o) => [o.outcome, o.job_id]), [["skipped_cap", null]]);
  });
});

await check("0096 recurring: a missed due date is advanced, never turned into a late request", async () => {
  await withRollback(async () => {
    const s = await rbSeries({ due: "past" });
    const out = await rbRun();
    assert.equal(out.created, 0, "nothing is backfilled");
    const row = await rbSeriesRow(s.id);
    const today = (await db.query(`select public.santo_domingo_today()::text as t`)).rows[0].t;
    assert.ok(row.due >= today, "next due date is today or later");
    assert.equal((await rbRequestsFor(RB_CLIENT)).length, 0);
  });
});

await check("0096 recurring: suspended client → paused with reason, no request; a direct request with no user is still refused", async () => {
  await withRollback(async () => {
    const s = await rbSeries({ due: "today+1" });
    await asService(`insert into public.client_suspensions (client_id, reason, suspended_by) values ('${RB_CLIENT}', 'Prueba 0096: cliente suspendido', '${ADMIN}')`);
    const out = await rbRun();
    assert.equal(out.created, 0);
    assert.equal(out.paused, 1);
    const row = await rbSeriesRow(s.id);
    assert.equal(row.status, "paused");
    assert.equal(row.paused_reason, "client_suspended");
    assert.equal((await rbRequestsFor(RB_CLIENT)).length, 0);
    await refused(() => asService(`insert into public.jobs (homeowner_id, trade, zone, description, status, job_type)
      values ('${RB_CLIENT}', 'plumber', 'Naco', 'Solicitud sin usuario para cliente suspendido.', 'requested', 'repair')`), /suspendida/);
    await refused(() => asUser(RB_CLIENT, `select public.set_recurring_booking_status('${s.id}', 'resume')`), /suspendida/);
  });
});

// ---- 0097 support tickets ---------------------------------------------------
// A dedicated client keeps the five-ticket cap isolated. Each check runs inside withRollback.

const SUP_CLIENT = "00000000-0000-4000-8000-0000000000e2";
await seedFixture(`insert into auth.users (id, phone) values ('${SUP_CLIENT}', '+18095550088') on conflict do nothing;`);

const supCreate = (uid, category, subject, body, job = null) =>
  asUser(uid, `select public.create_support_ticket('${category}', '${subject}', '${body}', ${job ? `'${job}'` : "null"}) as id`);
const supBody = "Necesito ayuda para cambiar el correo de mi cuenta, por favor.";

await check("0097 support: authors read only their own tickets and messages; direct writes are refused", async () => {
  await withRollback(async () => {
    const id = (await supCreate(SUP_CLIENT, "cuenta", "Cambiar correo", supBody)).rows[0].id;
    assert.equal((await asUser(SUP_CLIENT, `select count(*)::int as n from public.support_tickets where id = '${id}'`)).rows[0].n, 1);
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.support_tickets where id = '${id}'`)).rows[0].n, 0, "another user");
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.support_ticket_messages where ticket_id = '${id}'`)).rows[0].n, 0);
    await refused(() => asUser(SUP_CLIENT, `insert into public.support_tickets (author_id, category, subject) values ('${SUP_CLIENT}', 'otro', 'Directo')`), /permission denied|row-level security/);
    await asUser(SUP_CLIENT, `update public.support_tickets set status = 'closed' where id = '${id}'`).catch(() => {});
    assert.equal((await asUser(SUP_CLIENT, `select status from public.support_tickets where id = '${id}'`)).rows[0].status, "open", "status cannot change directly");
    await refused(() => asAnon(`select public.create_support_ticket('otro', 'Anónimo', '${supBody}', null)`), /permission denied/);
  });
});

await check("0097 support: create gates (category, subject, body length, job ownership)", async () => {
  await withRollback(async () => {
    await refused(() => supCreate(SUP_CLIENT, "spam", "Asunto válido", supBody), /Elige una categoría/);
    await refused(() => supCreate(SUP_CLIENT, "otro", "ab", supBody), /entre 3 y 120/);
    await refused(() => supCreate(SUP_CLIENT, "otro", "Asunto válido", "x".repeat(2001)), /entre 1 y 2000/);
    await refused(() => supCreate(SUP_CLIENT, "otro", "Asunto válido", "   "), /entre 1 y 2000/);
    await refused(() => supCreate(SUP_CLIENT, "trabajo", "Trabajo ajeno", supBody, JOB), /no es tuyo/);
  });
});

await check("0097 support: five open tickets at most; closing one frees a slot", async () => {
  await withRollback(async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await supCreate(SUP_CLIENT, "otro", `Ticket ${i + 1}`, supBody)).rows[0].id);
    await refused(() => supCreate(SUP_CLIENT, "otro", "Sexto", supBody), /5 tickets abiertos/);
    await asUser(SUP_CLIENT, `select public.close_support_ticket('${ids[0]}')`);
    const again = await supCreate(SUP_CLIENT, "otro", "Sexto ahora sí", supBody);
    assert.ok(again.rows[0].id);
  });
});

await check("0106 support queue paging: pages are ordered and disjoint; offsets validate; non-admins refused", async () => {
  await withRollback(async () => {
    await supCreate(SUP_CLIENT, "pagos", "Pagina uno", supBody);
    await supCreate(SUP_CLIENT, "pagos", "Pagina dos", supBody);
    const ids = async (offset) => (await asSession(ADMIN, "aal2", `select id from public.admin_list_support_tickets(null, ${offset})`)).rows.map((x) => x.id);
    const all = await ids(0);
    assert.ok(all.length >= 2, "fixture has at least two tickets");
    assert.deepEqual(await ids(1), all.slice(1), "offset 1 is the rest of page one, in the same order");
    assert.deepEqual(await ids(all.length), [], "an offset past the end returns no rows");
    await expectCode(() => asSession(ADMIN, "aal2", "select * from public.admin_list_support_tickets(null, -1)"), "22023");
    await refused(() => asUser(HOMEOWNER, `select * from public.admin_list_support_tickets(null, 0)`), /No autorizado/);
  });
});

await check("0097 support: admin definers are gated; non-admins and anonymous callers are refused", async () => {
  await withRollback(async () => {
    const id = (await supCreate(SUP_CLIENT, "pagos", "Cobro extra", supBody)).rows[0].id;
    await refused(() => asUser(HOMEOWNER, `select * from public.admin_list_support_tickets(null)`), /No autorizado/);
    await refused(() => asUser(HOMEOWNER, `select public.admin_support_open_count()`), /No autorizado/);
    await refused(() => asUser(SUP_CLIENT, `select public.admin_reply_support_ticket('${id}', 'Hola')`), /No autorizado/);
    await refused(() => asUser(SUP_CLIENT, `select public.admin_set_support_ticket_status('${id}', 'closed')`), /No autorizado/);
    await refused(() => asAnon(`select public.admin_list_support_tickets(null)`), /permission denied/);
  });
});

await check("0097 support: admin reply answers the ticket, the author sees it, the action is logged; user reply reopens", async () => {
  await withRollback(async () => {
    const id = (await supCreate(SUP_CLIENT, "pagos", "Cobro extra", supBody)).rows[0].id;
    const before = (await asService(`select count(*)::int as n from public.admin_audit_log where action = 'support_reply'`)).rows[0].n;
    await asUser(ADMIN, `select public.admin_reply_support_ticket('${id}', 'Revisamos el cobro y te confirmamos hoy.')`);
    assert.equal((await asUser(SUP_CLIENT, `select status from public.support_tickets where id = '${id}'`)).rows[0].status, "answered");
    // Both messages share now() inside this rollback transaction, so compare as a set, not by order.
    const thread = await asUser(SUP_CLIENT, `select from_admin, body from public.support_ticket_messages where ticket_id = '${id}'`);
    assert.deepEqual(thread.rows.map((m) => m.from_admin).sort(), [false, true], "the admin reply appears in the author's thread");
    const after = (await asService(`select count(*)::int as n from public.admin_audit_log where action = 'support_reply'`)).rows[0].n;
    assert.equal(after, before + 1, "admin reply is logged");
    await asUser(SUP_CLIENT, `select public.reply_support_ticket('${id}', 'Gracias. ¿Cuándo me confirman?')`);
    assert.equal((await asUser(SUP_CLIENT, `select status from public.support_tickets where id = '${id}'`)).rows[0].status, "open", "user reply reopens an answered ticket");
    const count = (await asUser(ADMIN, `select public.admin_support_open_count() as n`)).rows[0].n;
    assert.ok(count >= 1, "the open count sees the ticket");
  });
});

await check("0097 support: close is the author's; closed tickets take no replies until an admin reopens", async () => {
  await withRollback(async () => {
    const id = (await supCreate(SUP_CLIENT, "verificacion", "Verificación", supBody)).rows[0].id;
    await refused(() => asUser(HOMEOWNER, `select public.close_support_ticket('${id}')`), /No encontramos/);
    await asUser(SUP_CLIENT, `select public.close_support_ticket('${id}')`);
    assert.equal((await asUser(SUP_CLIENT, `select status from public.support_tickets where id = '${id}'`)).rows[0].status, "closed");
    await refused(() => asUser(SUP_CLIENT, `select public.reply_support_ticket('${id}', 'Otro mensaje')`), /está cerrado/);
    await refused(() => asUser(ADMIN, `select public.admin_reply_support_ticket('${id}', 'Respuesta')`), /está cerrado/);
    await asUser(ADMIN, `select public.admin_set_support_ticket_status('${id}', 'open')`);
    assert.equal((await asUser(SUP_CLIENT, `select status from public.support_tickets where id = '${id}'`)).rows[0].status, "open");
    await refused(() => asUser(ADMIN, `select public.admin_set_support_ticket_status('${id}', 'open')`), /ya está así/);
    const logged = (await asService(`select count(*)::int as n from public.admin_audit_log where action = 'support_status' and details->>'ticket_id' = '${id}'`)).rows[0].n;
    assert.equal(logged, 1, "reopen is logged");
  });
});

// ---- 0098 notification inbox ---------------------------------------------------
// Owner-only reads of safe columns, mark-read only on own rows, links limited to internal paths.

const INB_OTHER = "00000000-0000-4000-8000-0000000000e3";
await seedFixture(`insert into auth.users (id, phone) values ('${INB_OTHER}', '+18095550097') on conflict do nothing;
  insert into public.notification_log (id, user_id, channel, kind, status, detail, link)
  values ('00000000-0000-4000-8000-0000000001a1', '${HOMEOWNER}', 'push', 'welcome', 'sent', 'secreto', '/trabajos'),
         ('00000000-0000-4000-8000-0000000001a2', '${INB_OTHER}', 'push', 'welcome', 'sent', null, '/trabajos');`);
const INB_OWN = "00000000-0000-4000-8000-0000000001a1";
const INB_FOREIGN = "00000000-0000-4000-8000-0000000001a2";

// Column privileges (detail and user_id unreadable, kind and status unwritable) are not testable
// here: the harness re-grants table privileges after migrations. They are checked with
// has_column_privilege against production after 0098 is applied (see the PR).
await check("0098 inbox: owners read only their own log rows; anon reads nothing", async () => {
  await withRollback(async () => {
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.notification_log where id = '${INB_OWN}'`)).rows[0].n, 1);
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.notification_log where id = '${INB_FOREIGN}'`)).rows[0].n, 0);
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.notification_log where user_id = '${INB_OTHER}'`)).rows[0].n, 0);
  });
});

await check("0098 inbox: owners mark only their own rows read", async () => {
  await withRollback(async () => {
    const own = await asUser(HOMEOWNER, `update public.notification_log set read_at = now() where id = '${INB_OWN}' and read_at is null`);
    assert.equal(own.affectedRows ?? own.rowCount, 1);
    const foreign = await asUser(HOMEOWNER, `update public.notification_log set read_at = now() where id = '${INB_FOREIGN}'`);
    assert.equal(foreign.affectedRows ?? foreign.rowCount, 0, "another user's row is invisible to update");
    const read = await asUser(HOMEOWNER, `select read_at is not null as r from public.notification_log where id = '${INB_OWN}'`);
    assert.equal(read.rows[0].r, true);
  });
});

await check("0098 inbox: links must be internal paths", async () => {
  await withRollback(async () => {
    const ins = (link) => db.query(`insert into public.notification_log (user_id, channel, kind, status, link) values ('${HOMEOWNER}', 'email', 'welcome', 'sent', '${link}')`);
    await refused(() => ins("//evil.example"), /notification_log_link_check/);
    await refused(() => ins("https://evil.example"), /notification_log_link_check/);
    await db.query(`insert into public.notification_log (user_id, channel, kind, status, link) values ('${HOMEOWNER}', 'email', 'welcome', 'sent', '/trabajos/x')`);
  });
});

// ---- 0098 event groups ---------------------------------------------------------
// One entry per event: push and email of one event share an entry; a single-channel event that was
// not delivered still gets an entry. Read state is per group. The bell counts groups.

const GRP_JOB_A = "00000000-0000-4000-8000-0000000002a1";
const GRP_JOB_B = "00000000-0000-4000-8000-0000000002b1";

await check("0098 groups: a paired push and email form one entry; a failed single channel still gets one", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.notification_log (user_id, channel, kind, status, link, created_at) values
      ('${HOMEOWNER}', 'push',  'job_paid', 'sent', '/trabajos/${GRP_JOB_A}', '2026-11-19 10:00:00+00'),
      ('${HOMEOWNER}', 'email', 'job_paid', 'sent', '/trabajos/${GRP_JOB_A}', '2026-11-19 10:00:40+00'),
      ('${HOMEOWNER}', 'push',  'job_paid', 'no_subscription', '/trabajos/${GRP_JOB_B}', '2026-11-19 12:00:00+00'),
      ('${HOMEOWNER}', 'email', 'job_paid', 'skipped_unverified', '/trabajos/${GRP_JOB_B}', '2026-11-19 12:00:20+00'),
      ('${HOMEOWNER}', 'email', 'job_paid', 'skipped_preference', '/trabajos/00000000-0000-4000-8000-0000000002c1', '2026-11-19 13:00:00+00')`);
    const groups = (await asUser(HOMEOWNER, `select group_id, row_ids, channels, statuses, delivered, unread from public.my_notification_groups(50) where kind = 'job_paid' order by first_at`)).rows;
    assert.equal(groups.length, 2, "two events, two entries");
    assert.equal(groups.every((g) => !g.statuses.includes("skipped_preference")), true, "preference skips never appear");
    assert.equal(groups.find((g) => !g.delivered).statuses.sort().join(","), "no_subscription,skipped_unverified", "delivery gaps keep their reasons");
    const paired = groups.find((g) => g.row_ids.length === 2 && g.delivered);
    assert.ok(paired, "the paired event is one entry with both rows");
    assert.deepEqual([...paired.channels].sort(), ["email", "push"]);
    const failed = groups.find((g) => g.row_ids.length === 2 && !g.delivered);
    assert.ok(failed, "an event with no delivery still has an entry");
    assert.equal(failed.unread, true);
    const other = (await asUser(INB_OTHER, `select count(*)::int as n from public.my_notification_groups(50) where kind = 'job_paid'`)).rows[0].n;
    assert.equal(other, 0, "another user sees none of these events");
  });
});

await check("0098 groups: marking an entry read clears every row of that event and lowers the unread count", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.notification_log (user_id, channel, kind, status, link, created_at) values
      ('${HOMEOWNER}', 'push',  'job_paid', 'sent', '/trabajos/${GRP_JOB_A}', '2026-11-19 10:00:00+00'),
      ('${HOMEOWNER}', 'email', 'job_paid', 'sent', '/trabajos/${GRP_JOB_A}', '2026-11-19 10:00:40+00')`);
    const before = (await asUser(HOMEOWNER, `select row_ids from public.my_notification_groups(50) where kind = 'job_paid' and link = '/trabajos/${GRP_JOB_A}'`)).rows[0];
    const unreadBefore = (await asUser(HOMEOWNER, `select count(*)::int as n from public.my_notification_groups(200) where unread`)).rows[0].n;
    const ids = `'{${before.row_ids.join(",")}}'`;
    await asUser(HOMEOWNER, `update public.notification_log set read_at = now() where id = any(${ids}::uuid[]) and read_at is null`);
    const after = (await asUser(HOMEOWNER, `select unread from public.my_notification_groups(50) where kind = 'job_paid' and link = '/trabajos/${GRP_JOB_A}'`)).rows[0];
    assert.equal(after.unread, false, "both rows read, so the entry is read");
    const unreadAfter = (await asUser(HOMEOWNER, `select count(*)::int as n from public.my_notification_groups(200) where unread`)).rows[0].n;
    assert.equal(unreadAfter, unreadBefore - 1, "the bell count drops by one event");
  });
});

await check("0098 links: the SQL mapping matches the edge mapping for job, ticket and recurring kinds", async () => {
  const q = (kind, data) => db.query(`select public.notification_link('${kind}', '${data}'::jsonb) as l`).then((r) => r.rows[0].l);
  assert.equal(await q("job_paid", `{"job_id":"${GRP_JOB_A}"}`), `/trabajos/${GRP_JOB_A}`);
  assert.equal(await q("support_reply", `{"ticket_id":"${GRP_JOB_A}"}`), `/ayuda/tickets/${GRP_JOB_A}`);
  assert.equal(await q("support_reply", `{"ticket_id":"../x"}`), "/ayuda/tickets");
  assert.equal(await q("recurring_created", `{}`), "/cuenta/recurrentes");
  assert.equal(await q("welcome", `{}`), null);
});

// ---- 0099 pro checklist and nudge --------------------------------------------------
// Guidance only: the checklist reads, never gates. Each pro is a dedicated fixture.

const CK_BARE = "00000000-0000-4000-8000-0000000000c1";
const CK_PARTIAL = "00000000-0000-4000-8000-0000000000c2";
const CK_FULL = "00000000-0000-4000-8000-0000000000c3";
await seedFixture(`
  insert into auth.users (id, phone) values
    ('${CK_BARE}', '+18095550101'), ('${CK_PARTIAL}', '+18095550102'), ('${CK_FULL}', '+18095550103') on conflict do nothing;
  update public.profiles set role = 'pro' where id in ('${CK_BARE}', '${CK_PARTIAL}', '${CK_FULL}');
  insert into public.pros (id, trade, zone, price_min_dop, price_max_dop, verification_status) values
    ('${CK_BARE}', 'plumber', 'Naco', 2000, 4000, 'pending'),
    ('${CK_PARTIAL}', 'plumber', 'Naco', 2000, 4000, 'pending'),
    ('${CK_FULL}', 'plumber', 'Naco', 2000, 4000, 'approved');`);

const checklist = async (uid) => (await asUser(uid, "select item, state, visibility, priority, dismissed from public.get_my_pro_checklist() order by priority nulls last, item")).rows;
const stateOf = (rows, item) => rows.find((r) => r.item === item)?.state;

await check("0099 checklist: a bare pro is missing everything except price and zone; verification leads the nudge", async () => {
  await withRollback(async () => {
    const rows = await checklist(CK_BARE);
    assert.equal(rows.length, 7);
    for (const item of ["verificacion", "foto", "pago", "descripcion", "horario"]) assert.equal(stateOf(rows, item), "missing", item);
    assert.equal(stateOf(rows, "precios"), "done");
    assert.equal(stateOf(rows, "zona"), "done");
    assert.equal(rows.find((r) => r.item === "verificacion").priority, 1);
    assert.equal(rows.find((r) => r.item === "pago").visibility, "private", "payout details are private");
    assert.equal(rows.find((r) => r.item === "foto").visibility, "public");
  });
});

await check("0099 checklist: verification needs both cédula and selfie; a partial pro is incomplete", async () => {
  await withRollback(async () => {
    await seedFixture(`insert into public.pro_verifications (pro_id, stage, status, verified_at) values ('${CK_PARTIAL}', 'identity', 'approved', now())`);
    assert.equal(stateOf(await checklist(CK_PARTIAL), "verificacion"), "missing", "cédula approved, selfie missing");
    await seedFixture(`insert into public.pro_verifications (pro_id, stage, status, consent_version) values ('${CK_PARTIAL}', 'selfie', 'pending', 'test-v1')`);
    assert.equal(stateOf(await checklist(CK_PARTIAL), "verificacion"), "pending", "selfie in review");
    await seedFixture(`insert into public.pro_verifications (pro_id, stage, status, verified_at) values ('${CK_PARTIAL}', 'selfie', 'approved', now())`);
    assert.equal(stateOf(await checklist(CK_PARTIAL), "verificacion"), "done", "both approved");
  });
});

await check("0099 checklist: a complete pro sees every item done and no nudge", async () => {
  await withRollback(async () => {
    await seedFixture(`
      insert into public.pro_verifications (pro_id, stage, status, verified_at) values ('${CK_FULL}', 'identity', 'approved', now()), ('${CK_FULL}', 'selfie', 'approved', now());
      insert into public.pro_files (pro_id, kind, storage_path, review_status) values ('${CK_FULL}', 'avatar', '${CK_FULL}/avatar-test.jpg', 'approved');
      insert into public.pro_payout_details (pro_id, bank_code, account_number) values ('${CK_FULL}', '001', '1234567');
      insert into public.pro_weekly_hours (pro_id, weekday, enabled, start_time, end_time) values ('${CK_FULL}', 1, true, '08:00', '17:00');
      update public.pros set bio = 'Plomero con 10 años de experiencia.' where id = '${CK_FULL}';`);
    const rows = await checklist(CK_FULL);
    assert.equal(rows.filter((r) => r.state !== "done").length, 0, JSON.stringify(rows));
  });
});

await check("0099 checklist: non-pros get nothing; pending photo is in review, not missing", async () => {
  await withRollback(async () => {
    assert.equal((await checklist(HOMEOWNER)).length, 0);
    await seedFixture(`insert into public.pro_files (pro_id, kind, storage_path, review_status) values ('${CK_BARE}', 'avatar', '${CK_BARE}/pending.jpg', 'pending')`);
    assert.equal(stateOf(await checklist(CK_BARE), "foto"), "pending");
  });
});

await check("0099 nudge: dismissal persists, is the pro's own, and only accepts known items from pros", async () => {
  await withRollback(async () => {
    await asUser(CK_BARE, "select public.dismiss_my_pro_nudge('verificacion')");
    const after = await checklist(CK_BARE);
    assert.equal(after.find((r) => r.item === "verificacion").dismissed, true, "dismissal is visible to the pro");
    assert.equal((await asUser(CK_PARTIAL, "select count(*)::int as n from public.pro_nudge_dismissals")).rows[0].n, 0, "another pro sees none of it");
    assert.equal((await checklist(CK_PARTIAL)).find((r) => r.item === "verificacion").dismissed, false);
    await refused(() => asUser(HOMEOWNER, "select public.dismiss_my_pro_nudge('verificacion')"), /No autorizado/);
    await refused(() => asUser(CK_BARE, "select public.dismiss_my_pro_nudge('precios')"), /Elemento no válido/);
    await refused(() => asUser(CK_BARE, `insert into public.pro_nudge_dismissals (pro_id, item) values ('${CK_BARE}', 'foto')`), /permission denied|row-level security/);
  });
});

// ---------------------------------------------------------------------------
// 0100 · Admin view-as (read-only). Gate matrix, parity with each user's own reads,
// one audit row per entry, masked payout, and no change to any target row.
// ---------------------------------------------------------------------------

/** Like asUser, with the session level set by the caller (aal1 or aal2). */
async function asSession(uid, aal, sql) {
  await db.exec(
    `set role authenticated; set request.jwt.claim.sub = '${uid}';
     set request.jwt.claims = '{"sub":"${uid}","role":"authenticated","aal":"${aal}"}';`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub; reset request.jwt.claims;").catch(() => {});
  }
}

/** Like asSession, with a session_id claim (the entry dedupe key). */
async function asSessionId(uid, sessionId, sql) {
  await db.exec(
    `set role authenticated; set request.jwt.claim.sub = '${uid}';
     set request.jwt.claims = '{"sub":"${uid}","role":"authenticated","aal":"aal2","session_id":"${sessionId}"}';`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub; reset request.jwt.claims;").catch(() => {});
  }
}

/** Expects a refusal with the given SQLSTATE; the savepoint keeps the transaction usable. */
async function expectCode(run, code) {
  await db.exec("savepoint view_as_refused");
  try {
    await assert.rejects(run(), (e) => e.code === code, `expected SQLSTATE ${code}`);
  } finally {
    await db.exec("rollback to savepoint view_as_refused");
  }
}

/** Every read definer, for one target, as the given caller. */
const viewAsReads = (uid, aal, target) => [
  () => asSession(uid, aal, `select * from public.admin_view_as_profile('${target}')`),
  () => asSession(uid, aal, `select * from public.admin_view_as_jobs('${target}')`),
  () => asSession(uid, aal, `select * from public.admin_view_as_notifications('${target}', 50)`),
  () => asSession(uid, aal, `select * from public.admin_view_as_payout('${target}')`),
  () => asSession(uid, aal, `select * from public.admin_view_as_job('${target}', '${JOB}')`),
  () => asSession(uid, aal, `select * from public.admin_view_as_quotes('${target}', '${JOB}')`),
  () => asSession(uid, aal, `select * from public.admin_view_as_job_photos('${target}', '${JOB}')`),
  () => asSession(uid, aal, `select * from public.admin_view_as_job_payments('${target}', '${JOB}')`),
  () => asSession(uid, aal, `select * from public.admin_view_as_job_disputes('${target}', '${JOB}')`),
];

/** Byte fingerprint of every row the target owns, across the tables the preview reads. */
async function targetFingerprint(target) {
  const parts = [
    `select id::text as k, row_to_json(p)::text as v from public.profiles p where id = '${target}'`,
    `select id::text as k, row_to_json(j)::text as v from public.jobs j where homeowner_id = '${target}' or pro_id = '${target}'`,
    `select q.id::text as k, row_to_json(q)::text as v from public.quotes q join public.jobs j on j.id = q.job_id where j.homeowner_id = '${target}' or q.pro_id = '${target}'`,
    `select id::text as k, row_to_json(n)::text as v from public.notification_log n where user_id = '${target}'`,
    `select pro_id::text as k, row_to_json(d)::text as v from public.pro_payout_details d where pro_id = '${target}'`,
    `select ph.id::text as k, row_to_json(ph)::text as v from public.job_photos ph join public.jobs j on j.id = ph.job_id where j.homeowner_id = '${target}' or j.pro_id = '${target}'`,
    `select py.id::text as k, row_to_json(py)::text as v from public.payments py join public.jobs j on j.id = py.job_id where j.homeowner_id = '${target}' or j.pro_id = '${target}'`,
    `select d.id::text as k, row_to_json(d)::text as v from public.disputes d join public.jobs j on j.id = d.job_id where j.homeowner_id = '${target}' or j.pro_id = '${target}'`,
  ];
  const lines = [];
  for (const sql of parts) {
    const r = await db.query(`select coalesce(string_agg(k || '=' || v, E'\n' order by k), '') as f from (${sql}) x`);
    lines.push(r.rows[0].f);
  }
  return lines.join("\n--\n");
}

await check("0100 view-as gate: only a super admin with aal2 reads; every other caller gets 42501", async () => {
  await withRollback(async () => {
    // A regular admin (admin_role = 'admin') with a verified session. Fixture SQL, no user, so the guard allows it.
    await db.exec(`update public.profiles set role = 'admin', admin_role = 'admin' where id = '${OUTSIDER_PRO}'`);
    // Super admin, aal1 (no verified TOTP): is_admin() is false, so refused.
    for (const run of viewAsReads(ADMIN, "aal1", HOMEOWNER)) await expectCode(run, "42501");
    // Regular admin, aal2: refused by the super-admin check.
    for (const run of viewAsReads(OUTSIDER_PRO, "aal2", HOMEOWNER)) await expectCode(run, "42501");
    // Non-admins: a homeowner, a pro, and the target looking at themselves.
    for (const run of viewAsReads(HOMEOWNER, "aal2", HOMEOWNER)) await expectCode(run, "42501");
    for (const run of viewAsReads(PRO, "aal2", HOMEOWNER)) await expectCode(run, "42501");
    // Anonymous callers have no execute grant at all.
    await expectCode(() => asAnon(`select * from public.admin_view_as_profile('${HOMEOWNER}')`), "42501");
    await expectCode(() => asAnon(`select public.admin_view_as_enter('${HOMEOWNER}')`), "42501");
    // Super admin, aal2: reads work, and a missing target is P0002.
    const ok = await asSession(ADMIN, "aal2", `select count(*)::int as n from public.admin_view_as_profile('${HOMEOWNER}')`);
    assert.equal(ok.rows[0].n, 1);
    await expectCode(() => asSession(ADMIN, "aal2", `select * from public.admin_view_as_profile('00000000-0000-0000-0000-00000000ffff')`), "P0002");
  });
});

await check("0100 view-as parity: the preview returns the same jobs and quotes the user's own RLS returns", async () => {
  await withRollback(async () => {
    const own = await asUser(HOMEOWNER, `select id::text as id from public.jobs where homeowner_id = '${HOMEOWNER}' order by id`);
    const view = await asSession(ADMIN, "aal2", `select job_id::text as id from public.admin_view_as_jobs('${HOMEOWNER}') where viewer_role = 'homeowner' order by job_id`);
    assert.deepEqual(view.rows.map((r) => r.id), own.rows.map((r) => r.id));
    for (const { id } of own.rows) {
      const mine = await asUser(HOMEOWNER, `select id::text as id from public.quotes where job_id = '${id}' order by id`);
      const seen = await asSession(ADMIN, "aal2", `select quote_id::text as id from public.admin_view_as_quotes('${HOMEOWNER}', '${id}') order by quote_id`);
      assert.deepEqual(seen.rows.map((r) => r.id), mine.rows.map((r) => r.id), `homeowner quotes on ${id}`);
    }
    const proQuotes = await asUser(PRO, `select job_id::text as job from public.quotes where pro_id = '${PRO}'`);
    for (const { job } of proQuotes.rows) {
      const mine = await asUser(PRO, `select id::text as id from public.quotes where job_id = '${job}' and pro_id = '${PRO}' order by id`);
      const seen = await asSession(ADMIN, "aal2", `select quote_id::text as id from public.admin_view_as_quotes('${PRO}', '${job}') order by quote_id`);
      assert.deepEqual(seen.rows.map((r) => r.id), mine.rows.map((r) => r.id), `pro sees only own quote on ${job}`);
    }
  });
});

await check("0100 view-as job detail: photos, payments and disputes match what the party's own RLS returns", async () => {
  await withRollback(async () => {
    const owner = (await db.query(`select homeowner_id::text as h from public.jobs where id = '${JOB}'`)).rows[0].h;
    await db.exec(`insert into public.job_photos (job_id, uploaded_by, kind, storage_path)
      values ('${JOB}', '${owner}', 'before', 'view-as-probe/${JOB}.jpg')`);
    await db.exec(`insert into public.payments (job_id, currency, amount_minor, fx_rate_dop_per_usd, status)
      values ('${JOB}', 'DOP', 600000, 1, 'held')`);
    const side = (await db.query(`select (exists (select 1 from public.jobs where id = '${JOB}' and homeowner_id = '${owner}')) as ok`)).rows[0].ok;
    assert.equal(side, true);

    const ownPhotos = await asUser(owner, `select storage_path from public.job_photos where job_id = '${JOB}' order by storage_path`);
    const viewPhotos = await asSession(ADMIN, "aal2", `select storage_path from public.admin_view_as_job_photos('${owner}', '${JOB}') order by storage_path`);
    assert.deepEqual(viewPhotos.rows, ownPhotos.rows, "photos as the homeowner sees them");
    assert.ok(viewPhotos.rows.some((r) => r.storage_path === "view-as-probe/" + JOB + ".jpg"), "the probe photo is listed");

    const ownPay = await asUser(owner, `select amount_minor::text as a, status from public.payments where job_id = '${JOB}' order by created_at`);
    const viewPay = await asSession(ADMIN, "aal2", `select amount_minor::text as a, payment_status as status from public.admin_view_as_job_payments('${owner}', '${JOB}') order by created_at`);
    assert.deepEqual(viewPay.rows, ownPay.rows, "payment summary as the homeowner sees it");

    const ownDisp = await asUser(owner, `select id::text as id, stage, status from public.disputes where job_id = '${JOB}' order by opened_at desc`);
    const viewDisp = await asSession(ADMIN, "aal2", `select dispute_id::text as id, stage, dispute_status as status from public.admin_view_as_job_disputes('${owner}', '${JOB}') order by opened_at desc`);
    assert.deepEqual(viewDisp.rows, ownDisp.rows, "dispute status as the homeowner sees it");

    // A stranger with no role on this job gets nothing from the job-scoped definers.
    for (const q of [
      `select * from public.admin_view_as_job_photos('${OUTSIDER_PRO}', '${JOB}')`,
      `select * from public.admin_view_as_job_payments('${OUTSIDER_PRO}', '${JOB}')`,
      `select * from public.admin_view_as_job_disputes('${OUTSIDER_PRO}', '${JOB}')`,
    ]) {
      const r = await asSession(ADMIN, "aal2", q);
      assert.equal(r.rows.length, 0, q);
    }
  });
});

await check("0100 view-as payout: the preview shows the pro's account masked to the last four digits", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.pro_payout_details (pro_id, bank_code, branch_code, account_number)
      values ('${PRO}', '001', '0001', '123456789012')`);
    const r = await asSession(ADMIN, "aal2", `select account_masked from public.admin_view_as_payout('${PRO}')`);
    assert.equal(r.rows[0].account_masked, "•••• 9012");
  });
});

await check("0100 view-as notifications: the preview lists only the target's own inbox", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.notification_log (user_id, channel, kind, status, link)
      values ('${HOMEOWNER}', 'push', 'view_as_probe', 'sent', '/trabajos/${JOB}')`);
    const h = await asSession(ADMIN, "aal2", `select notice_kind from public.admin_view_as_notifications('${HOMEOWNER}', 50)`);
    assert.ok(h.rows.some((r) => r.notice_kind === "view_as_probe"), "the target's own row appears");
    const p = await asSession(ADMIN, "aal2", `select notice_kind from public.admin_view_as_notifications('${PRO}', 50)`);
    assert.ok(!p.rows.some((r) => r.notice_kind === "view_as_probe"), "another user's rows never appear");
  });
});

await check("0100 view-as audit: entering the mode writes exactly one row; refusals and reads write none", async () => {
  await withRollback(async () => {
    const count = async () => (await db.query(
      `select count(*)::int as n from public.admin_audit_log where action = 'view_as_start' and target_id = '${HOMEOWNER}'`,
    )).rows[0].n;
    const before = await count();
    await expectCode(() => asSession(OUTSIDER_PRO, "aal2", `select public.admin_view_as_enter('${HOMEOWNER}')`), "42501");
    assert.equal(await count(), before, "a refused entry writes nothing");
    await asSessionId(ADMIN, "view-as-s1", `select public.admin_view_as_enter('${HOMEOWNER}')`);
    assert.equal(await count(), before + 1, "one entry, one row");
    await asSessionId(ADMIN, "view-as-s1", `select public.admin_view_as_enter('${HOMEOWNER}')`);
    await asSessionId(ADMIN, "view-as-s1", `select public.admin_view_as_enter('${HOMEOWNER}')`);
    assert.equal(await count(), before + 1, "repeat loads in the same session add nothing");
    await asSessionId(ADMIN, "view-as-s2", `select public.admin_view_as_enter('${HOMEOWNER}')`);
    assert.equal(await count(), before + 2, "a new session logs its own entry");
    const keyed = await db.query(`select count(*)::int as n from public.admin_audit_log
      where action = 'view_as_start' and target_id = '${HOMEOWNER}' and details ->> 'session_id' = 'view-as-s2'`);
    assert.equal(keyed.rows[0].n, 1, "the new row carries the session key");
    const row = await db.query(`select actor_id::text as actor from public.admin_audit_log
      where action = 'view_as_start' and target_id = '${HOMEOWNER}' order by created_at desc limit 1`);
    assert.equal(row.rows[0].actor, ADMIN, "the row names the super admin as actor");
    const beforeReads = await count();
    for (const run of viewAsReads(ADMIN, "aal2", HOMEOWNER)) await run();
    assert.equal(await count(), beforeReads, "reading the preview does not add rows");
  });
});

await check("0100 view-as read-only: calling every read definer leaves the target's rows byte-identical", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.notification_log (user_id, channel, kind, status, link)
      values ('${HOMEOWNER}', 'email', 'job_accepted', 'sent', '/trabajos/${JOB}')`);
    await db.exec(`insert into public.pro_payout_details (pro_id, bank_code, branch_code, account_number)
      values ('${PRO}', '001', null, '5550001234')`);
    const targets = [HOMEOWNER, PRO, OUTSIDER_PRO];
    const before = {};
    for (const t of targets) before[t] = await targetFingerprint(t);
    for (const t of targets) for (const run of viewAsReads(ADMIN, "aal2", t)) await run();
    for (const t of targets) {
      assert.equal(await targetFingerprint(t), before[t], `rows of ${t} changed`);
    }
  });
});

// ---------------------------------------------------------------------------
// 0101 · Client tour flag. Owner-only, idempotent, refused for anon.
// ---------------------------------------------------------------------------
await check("0101 client tour: the stamp is owner-only and keeps the first completion time", async () => {
  await withRollback(async () => {
    const flag = async (uid) => (await db.query(
      `select client_tour_completed_at::text as t from public.profiles where id = '${uid}'`,
    )).rows[0].t;
    assert.equal(await flag(HOMEOWNER), null, "starts unset");
    await asUser(HOMEOWNER, "select public.stamp_client_tour()");
    assert.ok(await flag(HOMEOWNER), "the owner's own flag is stamped");
    assert.equal(await flag(PRO), null, "another user's flag is untouched");
    // Idempotent: a stamp never moves an existing completion time. Fixed value, so now() cannot hide a change.
    await db.exec(`update public.profiles set client_tour_completed_at = '2026-01-01T00:00:00Z' where id = '${HOMEOWNER}'`);
    await asUser(HOMEOWNER, "select public.stamp_client_tour()");
    assert.match(await flag(HOMEOWNER), /^2026-01-01 00:00:00/, "second stamp keeps the first time");
  });
});

await check("0101 client tour: anonymous callers cannot stamp", async () => {
  await withRollback(async () => {
    await expectCode(() => asAnon("select public.stamp_client_tour()"), "42501");
  });
});

// ---------------------------------------------------------------------------
// 0102 · Verified icon: batch stage read. Approved and unexpired stages only.
// ---------------------------------------------------------------------------
await check("0102 verified flags: returns approved, unexpired stage names only, for any caller", async () => {
  await withRollback(async () => {
    await db.exec(`insert into public.pro_verifications (pro_id, stage, status, verified_at, verified_by, expires_at, consent_version)
      values ('${PRO}', 'identity', 'approved', now(), '${ADMIN}', null, null),
             ('${PRO}', 'selfie', 'approved', now(), '${ADMIN}', null, null),
             ('${PRO}', 'insurance', 'approved', now(), '${ADMIN}', '2000-01-01', null),
             ('${OUTSIDER_PRO}', 'identity', 'pending', null, null, null, 'v1')`);
    const r = await asAnon(`select pro_id::text as id, stages from public.pro_verified_flags(array['${PRO}','${OUTSIDER_PRO}']::uuid[])`);
    assert.equal(r.rows.length, 1, "pending and absent pros return no row");
    assert.equal(r.rows[0].id, PRO);
    assert.deepEqual(r.rows[0].stages, ["identity", "selfie"], "expired insurance is excluded");
  });
});

await check("0102 verified flags: no rows for an empty list, and no direct read of pro_verifications", async () => {
  await withRollback(async () => {
    const r = await asAnon("select count(*)::int as n from public.pro_verified_flags('{}'::uuid[])");
    assert.equal(r.rows[0].n, 0);
    const direct = await asAnon(`select count(*)::int as n from public.pro_verifications`);
    assert.equal(direct.rows[0].n, 0, "anon sees no verification rows directly");
  });
});

// ---------------------------------------------------------------------------
// 0104 · Public profile fetch by id works outside the default city. City search still filters.
// ---------------------------------------------------------------------------
await check("0104 pro cards: a by-id fetch returns a pro in another city, and city search still filters", async () => {
  await withRollback(async () => {
    // Move an approved pro to Santiago. pros_set_city derives the city from the zone.
    await db.exec(`update public.pros set zone = 'Centro' where id = '${OUTSIDER_PRO}'`);
    const city = (await db.query(`select city from public.pros where id = '${OUTSIDER_PRO}'`)).rows[0].city;
    assert.equal(city, "santiago", "fixture is in Santiago");

    // By id, no city passed (default santo_domingo): the card is returned.
    const byId = await asUser(HOMEOWNER, `select id from public.list_pro_cards(null, null, '${OUTSIDER_PRO}'::uuid)`);
    assert.deepEqual(byId.rows.map((x) => x.id), [OUTSIDER_PRO], "by-id fetch works cross-city");

    // City search without an id still filters by city.
    const defaultCity = await asUser(HOMEOWNER, `select id from public.list_pro_cards()`);
    assert.equal(defaultCity.rows.some((x) => x.id === OUTSIDER_PRO), false, "default-city search excludes Santiago");
    const santiagoSearch = await asUser(HOMEOWNER, `select id from public.list_pro_cards(null, null, null, 'santiago')`);
    assert.ok(santiagoSearch.rows.some((x) => x.id === OUTSIDER_PRO), "Santiago search includes the pro");
  });
});

// ---------------------------------------------------------------------------
// 0103 · Pro price and zone editor. Owner-only RPC; the lockdown on direct writes stays intact.
// ---------------------------------------------------------------------------
await check("0103 pricing: the owner can update own price range and zone, city follows the zone", async () => {
  await withRollback(async () => {
    await asUser(PRO, "select public.pro_update_pricing_zone(1200, 3400, 'Naco')");
    const r = (await db.query(`select price_min_dop, price_max_dop, zone, city from public.pros where id = '${PRO}'`)).rows[0];
    assert.equal(r.price_min_dop, 1200);
    assert.equal(r.price_max_dop, 3400);
    assert.equal(r.zone, "Naco");
    assert.equal(r.city, "santo_domingo", "city re-derived by pros_set_city");
  });
});

await check("0103 pricing: the function has no target id, so another pro's row is never written", async () => {
  await withRollback(async () => {
    const sig = (await db.query(
      `select pronargs, pg_get_function_identity_arguments(oid) as args from pg_proc
        where proname = 'pro_update_pricing_zone' and pronamespace = 'public'::regnamespace`,
    )).rows;
    assert.equal(sig.length, 1);
    assert.equal(sig[0].pronargs, 3);
    assert.doesNotMatch(sig[0].args, /uuid/i, "no uuid parameter");
    const before = (await db.query(`select price_min_dop, zone from public.pros where id = '${PRO2}'`)).rows[0];
    await asUser(PRO, "select public.pro_update_pricing_zone(900, 1000, 'Gazcue')");
    const after = (await db.query(`select price_min_dop, zone from public.pros where id = '${PRO2}'`)).rows[0];
    assert.deepEqual(after, before, "PRO2 row unchanged");
  });
});

await check("0103 pricing: invalid ranges and zones are rejected", async () => {
  await withRollback(async () => {
    await expectCode(() => asUser(PRO, "select public.pro_update_pricing_zone(3000, 1000, 'Naco')"), "22023");
    await expectCode(() => asUser(PRO, "select public.pro_update_pricing_zone(-1, 1000, 'Naco')"), "22023");
    await expectCode(() => asUser(PRO, "select public.pro_update_pricing_zone(100, 200, 'Atlantis')"), "22023");
    await expectCode(() => asUser(PRO, "select public.pro_update_pricing_zone(null, 200, 'Naco')"), "22023");
  });
});

await check("0103 pricing: anonymous callers are refused", async () => {
  await withRollback(async () => {
    await expectCode(() => asAnon("select public.pro_update_pricing_zone(100, 200, 'Naco')"), "42501");
  });
});

await check("0103 pricing: direct table updates to price and zone are refused and change nothing", async () => {
  await withRollback(async () => {
    const before = (await db.query(`select price_min_dop, price_max_dop, zone from public.pros where id = '${PRO}'`)).rows[0];
    const attempts = [
      `update public.pros set zone = 'Naco' where id = '${PRO}'`,
      `update public.pros set price_min_dop = 1 where id = '${PRO}'`,
      `update public.pros set price_max_dop = 9 where id = '${PRO}'`,
    ];
    for (const sql of attempts) {
      await db.exec("savepoint direct_refused");
      let code = null;
      try { await asUser(PRO, sql); } catch (e) { code = e.code; } finally { await db.exec("rollback to savepoint direct_refused"); }
      // The guard trigger raises P0001 for these; the column grant does not stop them first.
      assert.equal(code, "P0001", `refused by the guard: ${sql}`);
    }
    const after = (await db.query(`select price_min_dop, price_max_dop, zone from public.pros where id = '${PRO}'`)).rows[0];
    assert.deepEqual(after, before, "row unchanged");
  });
});

// ---------------------------------------------------------------------------
// 0107 · Cancellation fee: RD$300 to the pro after a 2-hour grace, arrival, no-show, fee dispute, release.
// ---------------------------------------------------------------------------
const FEE_PAYMENT_HOURS_AGO = (job, hours) =>
  db.exec(`update public.payments set created_at = now() - interval '${hours} hours' where job_id = '${job}'`);
const paymentOf = async (id) => (await db.query(`select * from public.payments where id = '${id}'`)).rows[0];
const refundsOf = async (job) => (await db.query(`select reason, amount_dop, amount_minor, status from public.refunds where job_id = '${job}' order by created_at, id`)).rows;

await check("0107 fee: a client cancel more than 2 hours after payment keeps RD$300 for the pro and refunds the rest", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    const r = await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner') as r`);
    assert.equal(r.rows[0].r, "refund_pending");
    const [rf] = await refundsOf(job);
    assert.equal(rf.reason, "client_cancel_fee");
    assert.equal(rf.amount_dop, 5700, "paid 6000 minus fee 300");
    assert.equal(Number(rf.amount_minor), 9500, "minor: 10000 minus 500");
    const p = await paymentOf(payment);
    assert.equal(p.status, "held", "payment stays held: the fee is the pro's");
    assert.equal(p.keep_dop, 300);
    assert.equal(Number(p.keep_minor), 500);
    assert.equal(p.keep_pro_payout_dop, 300);
    assert.equal(p.keep_commission_dop, 0, "no commission on the fee");
    assert.ok(p.cancel_fee_release_after, "release time set");
  });
});

await check("0107 fee: inside 2 hours of payment the client cancel is free and fully refunded", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 1);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    const [rf] = await refundsOf(job);
    assert.equal(rf.reason, "client_cancel_pre_work");
    assert.equal(rf.amount_dop, 6000);
    assert.equal((await paymentOf(payment)).keep_dop, null);
  });
});

await check("0107 fee: a promo can leave a charge of RD$100; the fee is capped at the charged part and the tip returns whole", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    // amount_dop = chargedDop + tipDop = 100 + 0 is the cap case, so use 100 total with a 40 tip: charged 60.
    await db.exec(`update public.payments set amount_dop = 100, amount_minor = 1667, pro_payout_dop = 88, commission_dop = 12, tip_dop = 40 where id = '${payment}'`);
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    const p = await paymentOf(payment);
    assert.equal(p.keep_dop, 60, "fee = min(300, 100 - tip 40) = 60");
    const [rf] = await refundsOf(job);
    assert.equal(rf.reason, "client_cancel_fee");
    assert.equal(rf.amount_dop, 40, "refund = amount - fee = the whole tip");
  });
});

await check("0107 fee: the fee excludes the tip, and the refund returns the whole tip", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    // amount_dop 6000 = charged 5850 + tip 150.
    await db.exec(`update public.payments set tip_dop = 150 where id = '${payment}'`);
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    assert.equal((await paymentOf(payment)).keep_dop, 300, "fee = min(300, 6000 - 150 tip) = 300");
    const [rf] = await refundsOf(job);
    assert.equal(rf.amount_dop, 5700, "refund = 6000 - 300, which includes the full 150 tip");
  });
});

await check("0107 fee: the earliest held job payment is the primary; a later one refunds in full", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    const second = randomUUID();
    await db.exec(`insert into public.payments (id, job_id, provider, currency, amount_minor, fx_rate_dop_per_usd,
                     amount_dop, commission_dop, pro_payout_dop, purpose, status, created_at)
                   values ('${second}', '${job}', 'stripe', 'USD', 2000, 60, 1200, 0, 1200, 'job', 'held', now() - interval '1 hour')`);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    assert.equal((await paymentOf(payment)).keep_dop, 300);
    const rows = await refundsOf(job);
    const later = rows.find((x) => Number(x.amount_minor) === 2000);
    assert.ok(later, "later payment refunds in full");
    assert.equal(later.amount_dop, 1200);
  });
});

await check("0107 fee: a pro cancel stays a full refund with a strike, even after 2 hours", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(PRO, `select public.cancel_job_with_refund('${job}', 'pro')`);
    const [rf] = await refundsOf(job);
    assert.equal(rf.reason, "pro_cancel");
    assert.equal(rf.amount_dop, 6000);
    assert.equal((await paymentOf(payment)).keep_dop, null);
    assert.equal((await db.query(`select count(*)::int as n from public.pro_strikes where job_id = '${job}'`)).rows[0].n, 1);
  });
});

await check("0107 arrival: the pro marks arrival with a server timestamp; the client cannot", async () => {
  await withRollback(async () => {
    const { job } = await seedHeldJob();
    await expectCode(() => asUser(HOMEOWNER, `select public.pro_mark_arrived('${job}')`), "42501");
    await asUser(PRO, `select public.pro_mark_arrived('${job}')`);
    const first = (await db.query(`select arrived_at::text as t from public.jobs where id = '${job}'`)).rows[0].t;
    assert.ok(first, "arrived_at set");
    await asUser(PRO, `select public.pro_mark_arrived('${job}')`);
    const again = (await db.query(`select arrived_at::text as t from public.jobs where id = '${job}'`)).rows[0].t;
    assert.equal(again, first, "a repeat tap keeps the first arrival time");
  });
});

await check("0107 no-show: refused before arrival; after arrival it runs the late-cancel rule", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await expectCode(() => asUser(PRO, `select public.pro_report_client_no_show('${job}')`), "22023");
    await asUser(PRO, `select public.pro_mark_arrived('${job}')`);
    await asUser(PRO, `select public.pro_report_client_no_show('${job}')`);
    assert.equal((await db.query(`select status from public.jobs where id = '${job}'`)).rows[0].status, "cancelled");
    assert.equal((await paymentOf(payment)).keep_dop, 300, "fee applies after grace");
  });
});

await check("0107 no-show: inside 2 hours of payment it is free", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 1);
    await asUser(PRO, `select public.pro_mark_arrived('${job}')`);
    await asUser(PRO, `select public.pro_report_client_no_show('${job}')`);
    const [rf] = await refundsOf(job);
    assert.equal(rf.reason, "client_no_show");
    assert.equal(rf.amount_dop, 6000);
    assert.equal((await paymentOf(payment)).keep_dop, null);
  });
});

await check("0107 release: the fee waits 48 hours, then releases to the pro through the cancelled-job branch", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    const early = await db.query(`select payment_id from public.claim_due_payments(50) where payment_id = '${payment}'`);
    assert.equal(early.rows.length, 0, "not due inside the 48 hours");
    await db.exec(`update public.payments set cancel_fee_release_after = now() - interval '1 minute' where id = '${payment}'`);
    const due = (await db.query(`select amount_dop, amount_minor, pro_payout_dop, net_payout_dop, recovery_dop from public.claim_due_payments(50) where payment_id = '${payment}'`)).rows;
    assert.equal(due.length, 1);
    assert.equal(due[0].amount_dop, 300);
    assert.equal(Number(due[0].amount_minor), 500);
    assert.equal(due[0].pro_payout_dop, 300, "the whole fee is the pro's payout");
    assert.equal(due[0].net_payout_dop + due[0].recovery_dop, 300, "net plus recovery netting equals the fee");
  });
});

await check("0107 dispute: the client can contest the fee inside the window; it freezes release until resolved", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'El profesional nunca llegó al lugar.')`);
    assert.equal((await paymentOf(payment)).status, "disputed");
    await db.exec(`update public.payments set cancel_fee_release_after = now() - interval '1 minute' where id = '${payment}'`);
    const due = await db.query(`select payment_id from public.claim_due_payments(50) where payment_id = '${payment}'`);
    assert.equal(due.rows.length, 0, "frozen while the dispute is open");
  });
});

await check("0107 dispute: only the client, only inside the window, and only for a fee", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await expectCode(() => asUser(PRO, `select public.open_dispute('${job}', false, 'Quiero disputar la tarifa del cliente.')`), "22023");
    await db.exec(`update public.payments set cancel_fee_release_after = now() - interval '1 minute' where id = '${payment}'`);
    await expectCode(() => asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'Ya pasó la ventana de la tarifa.')`), "22023");
  });
});

await check("0107 dispute: a free cancel has no fee to contest", async () => {
  await withRollback(async () => {
    const { job } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 1);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await expectCode(() => asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'No hay tarifa que disputar aquí.')`), "22023");
  });
});

await check("0107 dispute: fee uphold releases the fee to the pro", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'El profesional nunca llegó al lugar.')`);
    const d = (await db.query(`select id from public.disputes where job_id = '${job}'`)).rows[0].id;
    await db.exec(`update public.disputes set evidence_due_at = now() - interval '1 minute' where id = '${d}'`);
    await db.exec(`update public.payments set cancel_fee_release_after = now() - interval '1 minute' where id = '${payment}'`);
    await asSession(ADMIN, "aal2", `select public.resolve_fee_dispute('${d}', 'fee_uphold', 'La evidencia confirma la llegada del profesional.')`);
    assert.equal((await paymentOf(payment)).status, "held");
    const due = await db.query(`select payment_id from public.claim_due_payments(50) where payment_id = '${payment}'`);
    assert.equal(due.rows.length, 1, "released after uphold");
  });
});

await check("0107 dispute: fee reversal refunds RD$300 to the client; the payment ends refunded", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'El profesional nunca llegó al lugar.')`);
    const d = (await db.query(`select id from public.disputes where job_id = '${job}'`)).rows[0].id;
    await db.exec(`update public.disputes set evidence_due_at = now() - interval '1 minute' where id = '${d}'`);
    await asSession(ADMIN, "aal2", `select public.resolve_fee_dispute('${d}', 'fee_reverse', 'No hay evidencia de que el profesional llegara.')`);
    const rfId = (await db.query(`select id from public.refunds where job_id = '${job}' and reason = 'fee_reversed'`)).rows[0].id;
    const first = (await db.query(`select id from public.refunds where job_id = '${job}' and reason = 'client_cancel_fee'`)).rows[0].id;
    await db.query(`select public.mark_refund_succeeded('${first}', 'st_1')`);
    await db.query(`select public.mark_refund_succeeded('${rfId}', 'st_2')`);
    const p = await paymentOf(payment);
    assert.equal(p.status, "refunded", "full amount refunded");
    assert.equal(Number(p.refunded_minor), 10000);
    assert.equal(p.keep_dop, null, "the fee is no longer the pro's");
  });
});

await check("0107 dispute: only an admin with AAL2 decides, with a reason", async () => {
  await withRollback(async () => {
    const { job } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'El profesional nunca llegó al lugar.')`);
    const d = (await db.query(`select id from public.disputes where job_id = '${job}'`)).rows[0].id;
    await db.exec(`update public.disputes set evidence_due_at = now() - interval '1 minute' where id = '${d}'`);
    await expectCode(() => asUser(HOMEOWNER, `select public.resolve_fee_dispute('${d}', 'fee_uphold', 'Intento de decidir por el cliente.')`), "42501");
    await expectCode(() => asSession(ADMIN, "aal2", `select public.resolve_fee_dispute('${d}', 'fee_uphold', 'corto')`), "22023");
  });
});

await check("0107 preview: homeowner sees RD$300 fee after grace, refund is the rest; before grace no fee", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    const early = (await asUser(HOMEOWNER, `select public.cancellation_preview('${job}') as r`)).rows[0].r;
    assert.equal(early.cancelable, true);
    assert.equal(early.fee_dop, 0, "inside grace");
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    const late = (await asUser(HOMEOWNER, `select public.cancellation_preview('${job}') as r`)).rows[0].r;
    assert.equal(late.fee_dop, 300);
    assert.equal(late.refund_dop, 5700);
    assert.equal(late.fee_applies, true);
    // The preview must agree with what cancel would do.
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    const [rf] = await refundsOf(job);
    assert.equal(rf.amount_dop, late.refund_dop);
    assert.equal((await paymentOf(payment)).keep_dop, late.fee_dop);
  });
});

await check("0107 preview: pro side never shows a fee; a stranger is refused", async () => {
  await withRollback(async () => {
    const { job } = await seedHeldJob();
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    const pro = (await asUser(PRO, `select public.cancellation_preview('${job}') as r`)).rows[0].r;
    assert.equal(pro.side, "pro");
    assert.equal(pro.fee_dop, 0);
    assert.equal(pro.refund_dop, 6000);
    await expectCode(() => asUser(OUTSIDER_PRO, `select public.cancellation_preview('${job}')`), "42501");
  });
});

await check("0107 statement: a released cancellation fee is its own line, carries no tip, and sums to fees", async () => {
  await withRollback(async () => {
    const { job, payment } = await seedHeldJob();
    await db.exec(`update public.payments set tip_dop = 150 where id = '${payment}'`);
    await FEE_PAYMENT_HOURS_AGO(job, 3);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${job}', 'homeowner')`);
    await db.exec(`update public.payments set status = 'released', released_at = now() where id = '${payment}'`);
    const year = new Date().getUTCFullYear();
    const st = (await asUser(PRO, `select public.pro_annual_statement(${year}) as r`)).rows[0].r;
    const fee = st.lines.find((l) => l.kind === "fee");
    assert.ok(fee, "fee line present");
    assert.equal(fee.gross, 300, "gross is the fee, not fee minus tip");
    assert.equal(fee.tip, 0, "tip is not part of the fee line");
    assert.equal(fee.net, 300);
    assert.equal(st.totals.fees, 300);
    assert.equal(st.totals.tips, 0, "the refunded tip is not reported as income");
  });
});

// ---------------------------------------------------------------------------
// 0108 · First-job commission waiver (Item 11). Money cases; proven on production by Sam after apply.
// ---------------------------------------------------------------------------
const launchPro = () => db.exec(`delete from public.pro_launch_waivers where pro_id = '${PRO}'`);
const payRow = async (id) => (await db.query(`select commission_dop, pro_payout_dop, amount_dop, tip_dop, commission_waived, status from public.payments where id = '${id}'`)).rows[0];
const paymentFor = async (job) => (await db.query(`select id from public.payments where job_id = '${job}' and status = 'held' order by created_at desc limit 1`)).rows[0].id;
const applyJob = (job, { amount = 6000, commission = 720, payout = 5280, event, session, purpose = "job" } = {}) =>
  db.query(`select public.apply_stripe_checkout('${event}', 'checkout.session.completed', false, '${job}', '${session}', 'pi_${event}',
     '${purpose}', 8750, 60, ${amount}, ${commission}, ${payout}, 0) as r`);

await check("0108 waiver: a first job is commission-free and the pro keeps the full amount", async () => {
  await withRollback(async () => {
    await launchPro();
    const job = await seedPayJob({ quote: 6000 });
    await applyJob(job, { event: "evt_w1", session: "cs_w1" });
    const p = await payRow(await paymentFor(job));
    assert.equal(p.commission_dop, 0);
    assert.equal(p.pro_payout_dop, 6000, "payout = 6000 (commission moved into payout)");
    assert.equal(p.commission_waived, true);
  });
});

await check("0108 waiver: the second job of the same pro pays normal tiers (12% of 6,000 = 720)", async () => {
  await withRollback(async () => {
    await launchPro();
    const first = await seedPayJob({ quote: 6000 });
    await applyJob(first, { event: "evt_w2a", session: "cs_w2a" });
    const second = await seedPayJob({ quote: 6000 });
    await applyJob(second, { event: "evt_w2b", session: "cs_w2b", commission: 720, payout: 5280 });
    const p = await payRow(await paymentFor(second));
    assert.equal(p.commission_dop, 720);
    assert.equal(p.commission_waived, false);
  });
});

await check("0108 waiver: a diagnostic as first job (RD$500) has no commission and no RD$400 minimum", async () => {
  await withRollback(async () => {
    await launchPro();
    const job = await seedPayJob({ quote: 500, type: "diagnostic" });
    await applyJob(job, { event: "evt_w3", session: "cs_w3", amount: 500, commission: 75, payout: 425, purpose: "diagnostic" });
    const p = await payRow(await paymentFor(job));
    assert.equal(p.commission_dop, 0);
    assert.equal(p.pro_payout_dop, 500);
  });
});

await check("0108 waiver: a tip on a waived first job stays with the pro", async () => {
  await withRollback(async () => {
    await launchPro();
    const job = await seedPayJob({ quote: 6000 });
    await db.query(`select public.apply_stripe_checkout('evt_w4', 'checkout.session.completed', false, '${job}', 'cs_w4', 'pi_w4',
      'job', 8750, 60, 6150, 720, 5430, 150) as r`).catch(() => null);
    const p = await payRow(await paymentFor(job));
    assert.equal(p.commission_dop, 0);
    assert.equal(p.tip_dop, 150);
    assert.equal(p.pro_payout_dop, 6150, "payout includes the tip; commission 0");
  });
});

await check("0108 waiver: a pro-plan pro's first job is commission-free too", async () => {
  await withRollback(async () => {
    await launchPro();
    await db.exec(`update public.pros set plan = 'pro' where id = '${PRO}'`);
    const job = await seedPayJob({ quote: 6000 });
    await applyJob(job, { event: "evt_w5", session: "cs_w5", commission: 480, payout: 5520 });
    assert.equal((await payRow(await paymentFor(job))).commission_dop, 0);
  });
});

await check("0108 waiver: a partial dispute on a waived job keeps 0 commission on the kept amount", async () => {
  await withRollback(async () => {
    await launchPro();
    const job = await seedPayJob({ quote: 6000 });
    await applyJob(job, { event: "evt_w6", session: "cs_w6" });
    await db.exec(`update public.jobs set status = 'completed', approved_at = now() - interval '1 hour' where id = '${job}'`);
    await asUser(HOMEOWNER, `select public.open_dispute('${job}', false, 'El trabajo quedó incompleto.')`);
    const d = (await db.query(`select id from public.disputes where job_id = '${job}'`)).rows[0].id;
    await db.exec(`update public.disputes set evidence_due_at = now() - interval '1 minute' where id = '${d}'`);
    await asSession(ADMIN, "aal2", `select public.resolve_dispute('${d}', 'partial_refund', 2000, 'Reembolso parcial por trabajo incompleto.')`);
    const p = (await db.query(`select keep_dop, keep_commission_dop, keep_pro_payout_dop from public.payments where job_id = '${job}'`)).rows[0];
    assert.equal(p.keep_dop, 4000);
    assert.equal(p.keep_commission_dop, 0, "no commission on the kept portion");
    assert.equal(p.keep_pro_payout_dop, 4000);
  });
});

await check("0108 waiver: a first job fully refunded before release does not consume the slot; the next job is waived", async () => {
  await withRollback(async () => {
    await launchPro();
    const first = await seedPayJob({ quote: 6000 });
    await applyJob(first, { event: "evt_w7a", session: "cs_w7a" });
    await db.exec(`update public.jobs set status = 'accepted' where id = '${first}'`);
    await asUser(HOMEOWNER, `select public.cancel_job_with_refund('${first}', 'homeowner')`);
    const rf = (await db.query(`select id from public.refunds where job_id = '${first}'`)).rows[0].id;
    await db.query(`select public.mark_refund_succeeded('${rf}', 'st_w7')`);
    assert.equal((await db.query(`select count(*)::int as n from public.pro_launch_waivers where pro_id = '${PRO}'`)).rows[0].n, 0, "slot freed");
    const second = await seedPayJob({ quote: 6000 });
    await applyJob(second, { event: "evt_w7b", session: "cs_w7b" });
    assert.equal((await payRow(await paymentFor(second))).commission_dop, 0, "the waiver moved to the next paid job");
  });
});

await check("0108 waiver: the switch OFF uses the slot at normal commission; switching ON does not retro-waive it", async () => {
  await withRollback(async () => {
    await launchPro();
    await db.exec(`update public.platform_settings set value = '{"enabled": false}' where key = 'first_job_free_enabled'`);
    const first = await seedPayJob({ quote: 6000 });
    await applyJob(first, { event: "evt_w8a", session: "cs_w8a" });
    const p = await payRow(await paymentFor(first));
    assert.equal(p.commission_dop, 720, "normal commission while off");
    assert.equal(p.commission_waived, false);
    await db.exec(`update public.platform_settings set value = '{"enabled": true}' where key = 'first_job_free_enabled'`);
    const second = await seedPayJob({ quote: 6000 });
    await applyJob(second, { event: "evt_w8b", session: "cs_w8b", commission: 720, payout: 5280 });
    assert.equal((await payRow(await paymentFor(second))).commission_dop, 720, "the second job is not waived either");
  });
});

await check("0108 waiver: one claim per pro is enforced by the database (second insert fails)", async () => {
  await withRollback(async () => {
    await launchPro();
    const job = await seedPayJob({ quote: 6000 });
    await applyJob(job, { event: "evt_w9", session: "cs_w9" });
    await assert.rejects(db.exec(`insert into public.pro_launch_waivers (pro_id, reason) values ('${PRO}', 'pre_launch')`), /duplicate key|unique/i);
  });
});

await check("0108 waiver: a pro with an earlier payment (pre-launch) gets no waiver", async () => {
  await withRollback(async () => {
    const job = await seedPayJob({ quote: 6000 });
    await applyJob(job, { event: "evt_w10", session: "cs_w10" });
    assert.equal((await payRow(await paymentFor(job))).commission_dop, 720);
  });
});

await check("0108 waiver: the switch is super-admin only, needs a reason, and is logged", async () => {
  await withRollback(async () => {
    await expectCode(() => asUser(HOMEOWNER, `select public.admin_set_first_job_free(false, 'Intento de cliente sin permiso.')`), "42501");
    await expectCode(() => asSession(OUTSIDER_PRO, "aal2", `select public.admin_set_first_job_free(false, 'Admin sin rango super.')`), "42501");
    await expectCode(() => asSession(ADMIN, "aal2", `select public.admin_set_first_job_free(false, 'corto')`), "22023");
    await asSession(ADMIN, "aal2", `select public.admin_set_first_job_free(false, 'Pausa de prueba del lanzamiento.')`);
    const v = (await db.query(`select (value->>'enabled')::boolean as e from public.platform_settings where key = 'first_job_free_enabled'`)).rows[0].e;
    assert.equal(v, false);
    const log = (await db.query(`select count(*)::int as n from public.admin_audit_log where action = 'first_job_free_changed'`)).rows[0].n;
    assert.equal(log, 1);
  });
});

await check("0108 waiver: clients cannot read the switch or the claim table", async () => {
  await withRollback(async () => {
    // RLS is on with no policies: a client reads zero rows (the harness re-grants table access, as Supabase defaults do).
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.pro_launch_waivers`)).rows[0].n, 0);
    assert.equal((await asUser(HOMEOWNER, `select count(*)::int as n from public.platform_settings`)).rows[0].n, 0);
    await assert.rejects(asUser(HOMEOWNER, `insert into public.platform_settings (key, value) values ('x', '{}')`));
  });
});

await check("0108 waiver: the statement and earnings show the waived job with its marker", async () => {
  await withRollback(async () => {
    await launchPro();
    const job = await seedPayJob({ quote: 6000 });
    await applyJob(job, { event: "evt_w11", session: "cs_w11" });
    await db.exec(`update public.payments set status = 'released', released_at = now() where job_id = '${job}'`);
    const year = new Date().getUTCFullYear();
    const st = (await asUser(PRO, `select public.pro_annual_statement(${year}) as r`)).rows[0].r;
    const line = st.lines.find((l) => l.waived === true);
    assert.ok(line, "waived line present");
    assert.equal(line.commission, 0);
    const earn = (await asUser(PRO, `select public.pro_earnings_summary() as r`)).rows[0].r;
    assert.equal(earn.first_job_waived_dop, 6000);
  });
});

// ---------------------------------------------------------------------------
// 0105 · Admin list of approved pros (view-as doorway). Admin-gated, read-only, approved and open only.
// ---------------------------------------------------------------------------
await check("0105 approved pros: an admin with aal2 sees approved, open pros; pending pros are excluded", async () => {
  await withRollback(async () => {
    const r = await asSession(ADMIN, "aal2", "select id, full_name, trade, zone, city, plan, available, is_demo from public.admin_list_approved_pros()");
    const ids = r.rows.map((x) => x.id);
    assert.ok(ids.includes(OUTSIDER_PRO), "approved pro listed");
    assert.equal(ids.includes(PENDING_PRO), false, "pending pro excluded");
    assert.deepEqual(Object.keys(r.rows[0]).sort(), ["available", "city", "full_name", "id", "is_demo", "plan", "trade", "zone"], "list columns only");
  });
});

await check("0105 approved pros: closed pros are excluded", async () => {
  await withRollback(async () => {
    await db.exec(`update public.pros set closed_at = now() where id = '${OUTSIDER_PRO}'`);
    const r = await asSession(ADMIN, "aal2", "select id from public.admin_list_approved_pros()");
    assert.equal(r.rows.some((x) => x.id === OUTSIDER_PRO), false);
  });
});

await check("0105 approved pros: only an admin with aal2 may call it; everyone else is refused", async () => {
  await withRollback(async () => {
    await expectCode(() => asSession(ADMIN, "aal1", "select * from public.admin_list_approved_pros()"), "42501");
    await expectCode(() => asSession(HOMEOWNER, "aal1", "select * from public.admin_list_approved_pros()"), "42501");
    await expectCode(() => asSession(OUTSIDER_PRO, "aal1", "select * from public.admin_list_approved_pros()"), "42501");
    await expectCode(() => asAnon("select * from public.admin_list_approved_pros()"), "42501");
  });
});

await check("0105 approved pros: city and trade filters apply; search matches names literally", async () => {
  await withRollback(async () => {
    await db.exec(`update public.profiles set full_name = 'Zorba Búsqueda' where id = '${OUTSIDER_PRO}'`);
    const name = "Zorba Búsqueda";
    const trade = (await db.query(`select trade from public.pros where id = '${OUTSIDER_PRO}'`)).rows[0].trade;
    const byTradeYes = await asSession(ADMIN, "aal2", `select id from public.admin_list_approved_pros(null, null, '${trade}')`);
    assert.ok(byTradeYes.rows.some((x) => x.id === OUTSIDER_PRO));
    const byTradeNo = await asSession(ADMIN, "aal2", "select id from public.admin_list_approved_pros(null, null, 'painter')");
    assert.equal(byTradeNo.rows.some((x) => x.id === OUTSIDER_PRO), false);
    const sd = await asSession(ADMIN, "aal2", "select id from public.admin_list_approved_pros(null, 'santo_domingo', null)");
    assert.ok(sd.rows.some((x) => x.id === OUTSIDER_PRO));
    const santiago = await asSession(ADMIN, "aal2", "select id from public.admin_list_approved_pros(null, 'santiago', null)");
    assert.equal(santiago.rows.some((x) => x.id === OUTSIDER_PRO), false);
    const bySearch = await asSession(ADMIN, "aal2", `select id from public.admin_list_approved_pros('${name.slice(0, 4).replace(/'/g, "''")}', null, null)`);
    assert.ok(bySearch.rows.some((x) => x.id === OUTSIDER_PRO), "name search matches");
    const wildcard = await asSession(ADMIN, "aal2", "select id from public.admin_list_approved_pros('%', null, null)");
    assert.equal(wildcard.rows.length, 0, "a bare % matches no name literally");
  });
});

// 0109 · Trades catalog (Item 10, Part 1). Public read of active trades, no client writes,
// foreign keys in place of the literal lists, super-admin create with reason and audit.
// ---------------------------------------------------------------------------
await check("0109 trades: anon reads 18 active trades; clients cannot write", async () => {
  const anon = await asAnon("select key, slug from public.trades order by key");
  assert.equal(anon.rows.length, 18);
  for (const k of ["cleaning", "handyman", "plumber"]) assert.ok(anon.rows.some((r) => r.key === k), k);
  await assert.rejects(
    () => asAnon("insert into public.trades (key, label_es, slug) values ('zz_probe', 'Prueba', 'zz-probe')"),
    (e) => e.code === "42501",
  );
});

await check("0109 trades: jobs, pros and recurring_bookings use foreign keys, not literal lists", async () => {
  const r = await db.query(
    `select conname from pg_constraint
      where conname in ('jobs_trade_fk','pros_trade_fk','recurring_bookings_trade_fk')
         or conname in ('jobs_trade_check','pros_trade_check','recurring_bookings_trade_check')`,
  );
  const names = r.rows.map((x) => x.conname).sort();
  assert.deepEqual(names, ["jobs_trade_fk", "pros_trade_fk", "recurring_bookings_trade_fk"]);
});

await check("0109 admin_upsert_trade: super admin creates with reason and audit; others refused", () => withRollback(async () => {
  await expectCode(
    () => asSession(ADMIN, "aal1", "select * from public.admin_upsert_trade('zz_probe','Prueba','zz-probe','{}','Motivo de prueba suficiente')"),
    "42501",
  );
  await expectCode(
    () => asSession(ADMIN, "aal2", "select * from public.admin_upsert_trade('zz_probe','Prueba','zz-probe','{}','corto')"),
    "22023",
  );
  await expectCode(
    () => asSession(ADMIN, "aal2", "select * from public.admin_upsert_trade('plumber','Plomería','plomeria-2','{}','Motivo de prueba suficiente')"),
    "22023",
  );
  const row = await asSession(
    ADMIN, "aal2",
    "select key, slug from public.admin_upsert_trade('zz_probe','Prueba','zz-probe','{}','Motivo de prueba suficiente')",
  );
  assert.equal(row.rows[0].key, "zz_probe");
  const audit = await db.query("select count(*)::int as n from public.admin_audit_log where action = 'trade_created' and details->>'key' = 'zz_probe'");
  assert.equal(audit.rows[0].n, 1);
}));

// 0110 · Company write-in (Item 10, Part 4). Companies only; admin resolution with reason and audit.
// ---------------------------------------------------------------------------
await check("0110 custom line: individuals cannot carry a write-in", () => withRollback(async () => {
  await expectCode(() => db.query(`update public.pros set custom_line = 'Bicicletas eléctricas' where id = '${PRO}'`), "23514");
}));

await check("0110 custom line: non-admins cannot resolve; a resolution happens once and is audited", () => withRollback(async () => {
  await db.exec(`update public.pros set custom_line = 'Taller de bicicletas' where id = '${COMPANY_PRO}'`);
  await expectCode(
    () => asSession(HOMEOWNER, "aal2", `select public.admin_resolve_custom_line('${COMPANY_PRO}','profile_only',null,null,null,null,'Motivo de prueba suficiente')`),
    "42501",
  );
  await expectCode(
    () => asSession(ADMIN, "aal2", `select public.admin_resolve_custom_line('${COMPANY_PRO}','profile_only',null,null,null,null,'corto')`),
    "22023",
  );
  await asSession(ADMIN, "aal2", `select public.admin_resolve_custom_line('${COMPANY_PRO}','profile_only',null,null,null,null,'Motivo de prueba suficiente')`);
  const r = await db.query(`select custom_line_resolution from public.pros where id = '${COMPANY_PRO}'`);
  assert.equal(r.rows[0].custom_line_resolution, "profile_only");
  await expectCode(
    () => asSession(ADMIN, "aal2", `select public.admin_resolve_custom_line('${COMPANY_PRO}','map','plumber',null,null,null,'Motivo de prueba suficiente')`),
    "22023",
  );
  const audit = await db.query(`select count(*)::int as n from public.admin_audit_log where action = 'custom_line_resolved' and target_id = '${COMPANY_PRO}'`);
  assert.equal(audit.rows[0].n, 1);
}));

await check("0110 custom line: map sets the primary catalog trade", () => withRollback(async () => {
  await db.exec(`update public.pros set custom_line = 'Limpieza de oficinas' where id = '${COMPANY_PRO}'`);
  await asSession(ADMIN, "aal2", `select public.admin_resolve_custom_line('${COMPANY_PRO}','map','cleaning',null,null,null,'Motivo de prueba suficiente')`);
  const r = await db.query(`select trade, custom_line_resolution from public.pros where id = '${COMPANY_PRO}'`);
  assert.equal(r.rows[0].trade, "cleaning");
  assert.equal(r.rows[0].custom_line_resolution, "mapped");
}));

// 0110 · Folded specialties (Item 10, Part 1). Pro picks from the catalog list for their own trade.
await check("0110 specialties: valid picks save; other trades' picks, direct writes, and non-pros are refused", () => withRollback(async () => {
  await db.exec(`update public.pros set trade = 'cleaning' where id = '${PRO}'`);
  await asUser(PRO, "select public.pro_set_specialties(array['Limpieza de hogar','Cisternas y tinacos','Limpieza de hogar'])");
  const r = await db.query(`select specialties from public.pros where id = '${PRO}'`);
  assert.deepEqual(r.rows[0].specialties, ["Cisternas y tinacos", "Limpieza de hogar"]);
  await expectCode(() => asUser(PRO, "select public.pro_set_specialties(array['Piscinas'])"), "22023");
  await expectCode(() => asUser(HOMEOWNER, "select public.pro_set_specialties(array['Limpieza de hogar'])"), "42501");
  await expectCode(() => asSession(PRO, "aal2", "update public.pros set specialties = array['Jardinería'] where id = '" + PRO + "'"), "42501");
  await expectCode(() => asSession(PRO, "aal2", `update public.pros set custom_line_resolution = 'profile_only' where id = '${PRO}'`), "42501");
}));

await check("0110 specialties: a resolved trade change clears the old specialties", () => withRollback(async () => {
  await db.exec(`update public.pros set trade = 'cleaning', specialties = array['Jardinería'], custom_line = 'Taller de limpieza', pro_type = 'company' where id = '${COMPANY_PRO}'`);
  await asSession(ADMIN, "aal2", `select public.admin_resolve_custom_line('${COMPANY_PRO}','map','moving',null,null,null,'Motivo de prueba suficiente')`);
  const r = await db.query(`select specialties from public.pros where id = '${COMPANY_PRO}'`);
  assert.deepEqual(r.rows[0].specialties, []);
}));

await db.close();

// A known-red entry must match a check that runs. Otherwise the list has gone stale.
for (const name of Object.keys(KNOWN_RED)) {
  if (!ranNames.has(name)) results.push(["FAIL", `KNOWN_RED entry matches no check: ${name}`]);
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
const known = results.filter(([s]) => s === "KNOWN_RED").length;
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed, ${known} known-red, ${failed} failed`);
process.exit(failed ? 1 : 0);
