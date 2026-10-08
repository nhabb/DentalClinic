import { ComponentType, ReactNode } from "react";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** A way forward — an empty state without one is a dead end. */
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center animate-fade-up">
      <div
        aria-hidden
        className="relative mb-5 flex size-16 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100"
      >
        <span className="absolute inset-0 rounded-2xl bg-brand-100/60 blur-md" />
        <Icon className="relative text-2xl text-brand-600" />
      </div>
      <h3 className="text-lg font-bold text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500 text-pretty">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
