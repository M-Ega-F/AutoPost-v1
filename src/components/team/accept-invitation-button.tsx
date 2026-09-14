"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/invitations/" + encodeURIComponent(token) + "/accept", { method: "POST" });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "We couldn't accept this invitation.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't accept this invitation.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-3"><Button onClick={() => void accept()} disabled={busy}>{busy ? "Accepting…" : "Accept invitation"}</Button>{message ? <p className="text-sm text-destructive">{message}</p> : null}</div>;
}
