"use client";

import * as React from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "next-themes";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const [position, setPosition] = React.useState<ToasterProps["position"]>(
    "bottom-right",
  );

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const apply = () => setPosition(query.matches ? "top-center" : "bottom-right");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position={position}
      visibleToasts={3}
      duration={4_000}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          error: "!duration-[6000ms]",
        },
        style: {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties,
      }}
      {...props}
    />
  );
};

export { Toaster };
