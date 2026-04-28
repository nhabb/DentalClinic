"use client";
import { useRef } from "react";
import { FaCamera } from "react-icons/fa";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  src?: string;
  onUpload?: (file: File) => void;
}

const sizeClasses: Record<string, string> = {
  sm: "w-8 h-8 text-sm",
  md: "w-10 h-10 text-base",
  lg: "w-14 h-14 text-xl",
  xl: "w-16 h-16 text-2xl",
};

const cameraIconSize: Record<string, string> = {
  sm: "text-[8px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
};

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
    onUpload(file);
    e.target.value = "";
  };

  const baseClass = `${sizeClasses[size]} rounded-full overflow-hidden flex items-center justify-center text-white font-bold flex-shrink-0`;

  const content = src ? (
    <img src={src} alt={name} className="w-full h-full object-cover" />
  ) : (
    <span>{getInitials(name)}</span>
  );

  if (onUpload) {
    return (
      <div
        role="button"
        aria-label="Change profile photo"
        className={`${baseClass} relative cursor-pointer group ${!src ? "bg-gradient-to-br from-dental-blue to-dental-teal" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        {content}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <FaCamera className={`text-white ${cameraIconSize[size]}`} />
        </div>
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

  return (
    <div className={`${baseClass} bg-gradient-to-br from-dental-blue to-dental-teal`}>
      {content}
    </div>
  );
}
