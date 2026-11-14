"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { signOut } from "@/lib/data/auth";
import { es } from "@/lib/i18n/es";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="button secondary signout-btn"
      type="button"
      onClick={async () => {
        await signOut(createSupabaseBrowserClient());
        router.push("/");
        router.refresh();
      }}
    >
      <Icon name="logout" />
      {es.account.signOut}
    </button>
  );
}
