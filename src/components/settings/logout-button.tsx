"use client";

import { Loader2, LogOut } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      className="h-11 sm:h-9"
      onClick={() => {
        startTransition(() => {
          void logoutAction();
        });
      }}
    >
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Logging out…
        </>
      ) : (
        <>
          <LogOut aria-hidden="true" />
          Log out
        </>
      )}
    </Button>
  );
}
