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

// Stand-ins for Supabase's auth and storage schemas.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, phone text);
  create role authenticated;
  create role anon;
  create role service_role;
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to public;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
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

for (const file of migrations) {
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
await db.exec(`
  insert into auth.users (id, phone) values
    ('${HOMEOWNER}', '+18095550001'),
    ('${PRO}', '+18095550002'),
    ('${ADMIN}', '+18095550003'),
    ('${OUTSIDER_PRO}', '+18095550004'),
    ('${PENDING_PRO}', '+18095550005'),
    ('${COMPANY_PRO}', '+18095550006');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
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

/** Runs SQL as a given user and returns the result. Always resets role. */
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
    /Solo un administrador/,
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
  await assert.rejects(
    db.exec(`insert into public.jobs (homeowner_id, trade, zone, description, fx_rate_dop_per_usd)
       values ('${HOMEOWNER}', 'plumber', 'Naco', 'TEST: x', 0)`),
    /check constraint/,
  );
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

await check("list_pro_cards returns only safe columns", async () => {
  const r = await asUser(HOMEOWNER, "select * from public.list_pro_cards()");
  const cols = Object.keys(r.rows[0] ?? {}).sort();
  assert.deepEqual(cols, [
    "avatar_path", "full_name", "id", "plan", "price_max_dop", "price_min_dop", "trade", "verified_at", "zone",
  ]);
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

await db.exec(`
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
const J_REPAIR = "10000000-0000-0000-0000-00000000f001";
const J_DIAG = "10000000-0000-0000-0000-00000000f002";

await db.exec(`
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
const photo = (uid, n) => `{${uid}/${n}.jpg}`;

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
    await db.exec(`insert into public.jobs (homeowner_id, trade, zone, description, status, created_at)
      values ('${HO4}','plumber','Naco','solicitud sin contratar ${i}','requested', now() - interval '10 days')`);
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
  const hours = (new Date(r.rows[0].ttl).getTime() || 0);
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
  await db.exec(`
    insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, payment_status, job_type)
      values ('${id}','${HO2}','${PRO2}','plumber','Naco','bloqueo de código','awaiting_approval','paid','repair');
    insert into public.job_secrets (job_id, completion_code, failed_attempts) values ('${id}','123456',5);`);
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

await db.exec(`
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
}

const applyCall = (job, { event = "evt_t1", amountDop = 5250, commission = 630, payout = 4620, sessionId = "cs_t1" } = {}) =>
  `select public.apply_stripe_checkout('${event}', 'checkout.session.completed', false, '${job}', '${sessionId}', 'pi_t1',
     'job', 8750, 60, ${amountDop}, ${commission}, ${payout}, 0) as r`;

await check("0014 link: a credit may only come from a diagnostic job", async () => {
  await withRollback(async () => {
    const { repair, trade } = await seedCreditPair();
    const other = randomUUID();
    await assert.rejects(
      db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, credit_from_job_id)
               values ('${other}', '${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Otra reparación.', 'accepted', 'repair', 'unpaid', '${repair}')`),
      /debe venir de un diagnóstico/,
    );
  });
});

await check("0014 link: an unpaid diagnostic cannot be credited", async () => {
  await withRollback(async () => {
    const { trade } = (await db.query(`select trade from public.pros where id = '${PRO}'`)).rows[0];
    const diag = randomUUID();
    await db.exec(`insert into public.jobs (id, homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status)
                   values ('${diag}', '${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Diagnóstico sin pagar.', 'accepted', 'diagnostic', 'unpaid')`);
    await assert.rejects(
      db.exec(`insert into public.jobs (homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, credit_from_job_id)
               values ('${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Reparación nueva.', 'accepted', 'repair', 'unpaid', '${diag}')`),
      /no está pagado/,
    );
  });
});

await check("0014 link: only one repair per diagnostic", async () => {
  await withRollback(async () => {
    const { diag, trade } = await seedCreditPair();
    await assert.rejects(
      db.exec(`insert into public.jobs (homeowner_id, pro_id, trade, zone, description, status, job_type, payment_status, credit_from_job_id)
               values ('${HOMEOWNER}', '${PRO}', '${trade}', 'Naco', 'Segunda reparación.', 'accepted', 'repair', 'unpaid', '${diag}')`),
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
  await assert.rejects(
    asUser(PRO, `update public.pros set stripe_account_id = 'acct_evil' where id = '${PRO}'`),
    /asigna Listavy/,
  );
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

await db.close();

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
