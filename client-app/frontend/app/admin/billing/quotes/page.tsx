"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Treatment plans are a tab on the billing page now, not a page of their own.
 *
 * The route stays so that bookmarks and the chart's link keep working — and
 * the `?patient=` the chart has always sent is finally carried through
 * instead of being dropped on the floor, which is what it was until now.
 */
export default function QuotesRedirect() {
  const router = useRouter();

  useEffect(() => {
    const patient = new URLSearchParams(window.location.search).get("patient");
    router.replace(
      `/admin/billing?view=plans${patient ? `&patient=${patient}` : ""}`,
    );
  }, [router]);

  return null;
}
