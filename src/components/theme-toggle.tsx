"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 rounded-full hover:bg-primary/10 hover:text-primary lg:size-9"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={mounted ? label : "Toggle color theme"}
      aria-pressed={mounted ? isDark : undefined}
      title={mounted ? label : "Toggle color theme"}
      disabled={!mounted}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
