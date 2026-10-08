"use client";
import { useRef } from "react";
import { FaCamera } from "react-icons/fa";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  src?: string;
  onUpload?: (dataUrl: string) => void;
}

const sizeClasses: Record<string, string> = {
  sm: "size-9 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-16 text-xl",
};

const cameraIconSize: Record<string, string> = {
  sm: "text-[8px]",
  md: "text-[10px]",
  lg: "text-sm",
  xl: "text-base",
};

/* A patient list is far easier to scan when the initials bubbles are not all
 * the same colour. The tone is derived from the name, so the same person keeps
 * the same colour on every screen. All five sit at the 600 level, so white
 * initials stay legible on each. */
const TONES = [
  "from-brand-500 to-brand-700",
  "from-clay-500 to-clay-700",
  "from-honey-500 to-honey-700",
  "from-leaf-500 to-leaf-700",
  "from-brick-400 to-brick-600",
];

function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return TONES[hash % TONES.length];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ name, size = "lg", src, onUpload }: AvatarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    const reader = new FileReader();
    reader.onload = () => onUpload(reader.result as string);
    reader.readAsDataURL(file);
    // reset so the same file can be re-selected
    e.target.value = "";
  };

  const baseClass = cn(
    sizeClasses[size],
    "relative shrink-0 overflow-hidden rounded-full font-bold text-white",
    "ring-2 ring-white/70 shadow-sm",
    "flex items-center justify-center select-none",
  );

  const gradient = cn("bg-gradient-to-br", toneFor(name));

  const content = src ? (
    <img src={src} alt={name} className="size-full object-cover" />
  ) : (
    <span className="tracking-wide">{getInitials(name)}</span>
  );

  if (onUpload) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Change profile photo"
        className={cn(baseClass, "group cursor-pointer", !src && gradient)}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {content}
        <span className="absolute inset-0 flex items-center justify-center bg-ink-950/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <FaCamera className={cn("text-white", cameraIconSize[size])} />
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    );
  }

  return <div className={cn(baseClass, !src && gradient)}>{content}</div>;
}
