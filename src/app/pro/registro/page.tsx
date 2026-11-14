import { redirect } from "next/navigation";
import { getMyPro } from "@/lib/data/pros";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RegistrationForm } from "./RegistrationForm";
import { BackBar } from "@/components/BackBar";
import { connection } from "next/server";

export const metadata = { title: "Ofrecer mis servicios" };
export const instant = false;

export default async function RegistrationPage() {
    // Per-request render: the session is read at request time.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // One application per account. Existing applicants see their status instead.
  const existing = await getMyPro(supabase);
  if (existing) redirect("/pro/estado");

  return (
    <>
      <BackBar href="/cuenta" />
      <RegistrationForm />
    </>
  );
}
