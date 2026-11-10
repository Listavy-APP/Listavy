import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Storage interface for pro files. Callers use these functions, never the Supabase
 * storage client directly. A future move (S3, R2, etc.) changes this file only.
 */

export const BUCKETS = {
  documents: "pro-documents",
  workPhotos: "pro-work-photos",
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

/** Uploads a JPEG under <ownerId>/<random>.jpg and returns the object path. */
export async function uploadJpeg(
  supabase: SupabaseClient,
  bucket: Bucket,
  ownerId: string,
  blob: Blob,
): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Uploads a company document (JPEG or PDF) under <ownerId>/<random>.<ext>. Returns the object path. */
export async function uploadCompanyDocument(
  supabase: SupabaseClient,
  ownerId: string,
  blob: Blob,
  contentType: "image/jpeg" | "application/pdf",
): Promise<string> {
  const ext = contentType === "application/pdf" ? "pdf" : "jpg";
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKETS.documents).upload(path, blob, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Short-lived link for a private object. RLS decides whether the caller may sign it. */
export async function signedUrl(
  supabase: SupabaseClient,
  bucket: Bucket,
  path: string,
  seconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
}
