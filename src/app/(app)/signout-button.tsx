"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function SignOutButton() {
  const router = useRouter();

  if (!isSupabaseConfigured()) return null;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
    >
      Sign out
    </button>
  );
}
