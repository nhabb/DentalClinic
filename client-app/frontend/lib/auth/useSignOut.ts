"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signOut } from "@/lib/auth/session";

/**
 * The one way a screen signs out: clears the session (waiting for the server
 * to drop its cookies, see endServerSession), then leaves. Every logout
 * button uses it, so a new session hint or cache is cleared everywhere.
 */
export function useSignOut(destination = "/login"): () => Promise<void> {
  const router = useRouter();
  return async () => {
    await signOut();
    toast.success("Logged out.");
    router.push(destination);
  };
}
