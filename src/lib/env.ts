/**
 * Reads public environment variables and fails fast when one is missing.
 * Only NEXT_PUBLIC_* values belong here. Server secrets are read where needed.
 * Note: NEXT_PUBLIC_* values are inlined at build time, so the reads below
 * must stay as literal property accesses.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name}. Revisa .env.example.`);
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
