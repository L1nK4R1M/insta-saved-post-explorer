"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const themes = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Laptop },
] as const;

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  const currentTheme = mounted ? theme : "system";
  const CurrentIcon = themes.find((item) => item.value === currentTheme)?.icon ?? Laptop;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="icon-button" type="button" aria-label="Changer le thème">
          <CurrentIcon aria-hidden="true" className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content" align="end" sideOffset={8}>
          <DropdownMenu.Label className="menu-label">Apparence</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={currentTheme} onValueChange={setTheme}>
            {themes.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className={cn("menu-item", currentTheme === value && "menu-item-active")}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span>{label}</span>
                <DropdownMenu.ItemIndicator className="ml-auto">
                  <Check aria-hidden="true" className="size-4" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function subscribeToHydration() {
  return () => undefined;
}
