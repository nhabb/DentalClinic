"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Quotes have their own page now (`/admin/quotes`), one stage of four:
 * Patients plan, Quotes price, Billing bills, Payments pay.
 *
 * The route stays so that bookmarks and old links keep working, and the
 * `?patient=` they carry is passed through so the quote opens straight away.
 */
export default function QuotesRedirect() {
  const router = useRouter();

  useEffect(() => {
    const patient = new URLSearchParams(window.location.search).get("patient");
    router.replace(`/admin/quotes${patient ? `?patient=${patient}` : ""}`);
  }, [router]);

  return null;
}
