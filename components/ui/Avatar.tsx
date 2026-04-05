interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses: Record<string, string> = {
  sm: "w-8 h-8 text-sm",
  md: "w-10 h-10 text-base",
  lg: "w-14 h-14 text-xl",
  xl: "w-16 h-16 text-2xl",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("");
}

export function Avatar({ name, size = "lg" }: AvatarProps) {
  return (
    <div
      className={`${sizeClasses[size]} bg-gradient-to-br from-dental-blue to-dental-teal rounded-full flex items-center justify-center text-white font-bold`}
    >
      {getInitials(name)}
    </div>
  );
}
