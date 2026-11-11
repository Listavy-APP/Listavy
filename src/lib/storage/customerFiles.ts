import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Storage for customer photos. Private bucket: no public URLs.
 * Callers read through signed URLs; RLS decides who may sign (migration 0009).
 */
export const CUSTOMER_BUCKET = "customer-avatars";

/** Uploads a square JPEG under <customerId>/<random>.jpg and returns the object path. */
export async function uploadCustomerPhoto(
  supabase: SupabaseClient,
  customerId: string,
  blob: Blob,
): Promise<string> {
  const path = `${customerId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(CUSTOMER_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  return path;
}

/** Removes an object. Best effort: the profile row is the source of truth. */
export async function removeCustomerPhoto(supabase: SupabaseClient, path: string): Promise<void> {
  await supabase.storage.from(CUSTOMER_BUCKET).remove([path]);
}

/** Short-lived link for a customer photo the caller may read. Null if not allowed or missing. */
export async function customerPhotoUrl(
  supabase: SupabaseClient,
  path: string | null,
  seconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(CUSTOMER_BUCKET).createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}
