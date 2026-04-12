"use client";

import { useState, useEffect } from "react";
import { Languages } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGUAGES = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "ar", label: "العربية", flag: "🇸🇦" },
] as const;

type Props = {
  variant?: "outline" | "ghost";
};

export default function LanguageSwitcher({ variant = "outline" }: Props) {
  const { language, setLanguage } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = LANGUAGES.find((l) => l.value === language);

  if (!mounted) {
    return (
      <Button variant={variant} disabled>
        <Languages className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant}>
          <Languages className="h-4 w-4" />
          {current?.flag} {current?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>Select Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(val) =>
            setLanguage(val as "en" | "fr" | "ar")
          }
        >
          {LANGUAGES.map(({ value, label, flag }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <span className="flex items-center gap-2">
                <span>{flag}</span>
                <span>{label}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
