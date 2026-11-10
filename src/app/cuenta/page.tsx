import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import { getCurrentProfile } from "@/lib/data/profiles";
import { es } from "@/lib/i18n/es";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: es.account.title };

// Session-dependent page: block on the server so the auth redirect returns a real 307.
export const instant = false;

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const profile = await getCurrentProfile(supabase);

  return (
    <section className="stack">
      <h1>{es.account.title}</h1>
      {profile ? (
        <dl className="details">
          <dt>{es.account.phone}</dt>
          <dd>{profile.phone ?? "—"}</dd>
          <dt>{es.account.role}</dt>
          <dd>{es.account.roles[profile.role]}</dd>
        </dl>
      ) : (
        <p className="error">{es.account.noProfile}</p>
      )}
      <Link className="button secondary" href="/pro/estado">
        {es.account.proStatus}
      </Link>
      <Link className="button secondary" href="/pro/registro">
        {es.account.becomePro}
      </Link>
      <SignOutButton />
    </section>
  );
}
