import { Badge } from "@/components/ui/Badge";

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "leaf" : "brick"} dot>
      {active ? "Active" : "Suspended"}
    </Badge>
  );
}

const ROLE_TONE = { admin: "brand", doctor: "clay", secretary: "honey", superadmin: "neutral" } as const;

export function RoleBadge({ role }: { role: string }) {
  const tone = (ROLE_TONE as Record<string, "brand" | "clay" | "honey" | "neutral">)[role] ?? "neutral";
  return <Badge tone={tone}>{role}</Badge>;
}
