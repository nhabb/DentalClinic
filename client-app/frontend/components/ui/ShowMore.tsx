"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

/** "Showing 10 of 42" and a button for the next ten, under a paged list. */
export function ShowMore({
  shown,
  total,
  loading,
  onClick,
}: {
  shown: number;
  total: number;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <p className="text-xs text-gray-500 tabular-nums">
        {t("common.showingOf").replace("{shown}", String(shown)).replace("{total}", String(total))}
      </p>
      {shown < total && (
        <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
          {loading ? t("common.loading") : t("common.showMore")}
        </Button>
      )}
    </div>
  );
}
