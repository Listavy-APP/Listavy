"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/data/auth";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="button secondary"
      type="button"
      onClick={async () => {
        await signOut(createSupabaseBrowserClient());
        router.push("/");
        router.refresh();
      }}
    >
      {es.account.signOut}
    </button>
  );
}
