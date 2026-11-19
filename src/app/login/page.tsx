import { LoginMethods } from "./LoginMethods";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/nav/safeNext";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Reads ?next=, so the page renders per request (same pattern as other session pages).
export const instant = false;

export const metadata = { title: "Entrar" };

/** ?next=<path> returns the user there after sign-in (e.g. /pedir?pro=<ids>). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await connection();
  const { next } = await searchParams;
  // Already signed in: go where the sign-in would have sent them.
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) redirect(safeNext(next));
  return <LoginMethods next={safeNext(next)} />;
}
