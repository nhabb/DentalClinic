import { ElementType } from "react";

interface StatsCardProps {
  icon: ElementType;
  iconBgClass: string;
  iconColorClass: string;
  value: React.ReactNode;
  label: string;
  accentClass?: string;
}

export function StatsCard({
  icon: Icon,
  iconBgClass,
  iconColorClass,
  value,
  label,
  accentClass,
}: StatsCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl p-6 shadow-sm ${
        accentClass ? accentClass : "border border-gray-100"
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`w-12 h-12 ${iconBgClass} rounded-xl flex items-center justify-center`}
        >
          <Icon className={`${iconColorClass} text-xl`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
