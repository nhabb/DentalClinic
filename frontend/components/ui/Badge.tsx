import { ComponentType, ReactNode } from "react";

interface BadgeProps {
  icon?: ComponentType<{ className?: string }>;
  bgClass: string;
  textClass: string;
  children: ReactNode;
  size?: "sm" | "md";
}

export function Badge({
  icon: Icon,
  bgClass,
  textClass,
  children,
  size = "sm",
}: BadgeProps) {
  const padding = size === "md" ? "px-3 py-1" : "px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 ${padding} ${bgClass} ${textClass} text-xs font-medium rounded-full`}
    >
      {Icon && <Icon className="text-xs" />}
      {children}
    </span>
  );
}
