// Listavy · delete-account
// Signed-in customer deletes their account. Steps:
//   1. anonymise_customer (service role): blocks on open work; clears personal data; returns photo paths.
//   2. remove the customer photo objects from storage.
//   3. delete the auth user (removes the phone login). Job, payment, review, and dispute records stay.
// Idempotent on retry: step 1 finds nothing left to clear, step 3 retries.
// NOT DEPLOYED until reviewed. Deleting an account is irreversible: test with a TEST account only.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: "Debes entrar primero." }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: paths, error: rpcError } = await admin.rpc("anonymise_customer", { p_customer: userId });
  if (rpcError) {
    // The database raises a Spanish message when the account is blocked. Pass it through.
    return json({ error: rpcError.message }, 409);
  }

  const photoPaths = (paths ?? []) as string[];
  if (photoPaths.length > 0) {
    // Best effort: the personal data is already gone from the profile row.
    await admin.storage.from("customer-avatars").remove(photoPaths);
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    return json({ error: "No pudimos terminar de eliminar tu cuenta. Intenta de nuevo." }, 500);
  }
  return json({ ok: true });
});
