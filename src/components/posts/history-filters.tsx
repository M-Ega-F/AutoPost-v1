"use client";

import { useRouter } from "next/navigation";
import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountSummary, HistoryQuery } from "@/lib/domain/types";
import { PLATFORM_META, POST_STATUS_META } from "@/lib/status";

const fieldClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function dateInTimeZone(timeZone: string, offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays),
  );
  return date.toISOString().slice(0, 10);
}

function presetForQuery(query: HistoryQuery, timeZone: string): string {
  if (!query.from && !query.to) return "all";
  const today = dateInTimeZone(timeZone);
  if (query.from === today && query.to === today) return "today";
  if (query.from === dateInTimeZone(timeZone, -6) && query.to === today) return "last7";
  if (query.from === dateInTimeZone(timeZone, -29) && query.to === today) return "last30";
  return "custom";
}

function labelForAccount(account: AccountSummary): string {
  return `${account.accountLabel ?? "Unnamed account"} · ${PLATFORM_META[account.platform].label}`;
}

export function HistoryFilters({
  query,
  accounts,
  timeZone,
}: {
  query: HistoryQuery;
  accounts: AccountSummary[];
  timeZone: string;
}) {
  const router = useRouter();
  const active = Boolean(
    query.search ||
      query.status ||
      query.platform ||
      query.accountId ||
      query.from ||
      query.to ||
      query.sort !== "newest",
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const preset = String(form.get("datePreset") ?? "all");

    for (const name of ["search", "status", "platform", "accountId", "sort", "pageSize"]) {
      const value = String(form.get(name) ?? "").trim();
      if (value) params.set(name, value);
    }

    if (preset === "today") {
      const today = dateInTimeZone(timeZone);
      params.set("from", today);
      params.set("to", today);
    } else if (preset === "last7") {
      params.set("from", dateInTimeZone(timeZone, -6));
      params.set("to", dateInTimeZone(timeZone));
    } else if (preset === "last30") {
      params.set("from", dateInTimeZone(timeZone, -29));
      params.set("to", dateInTimeZone(timeZone));
    } else if (preset === "custom") {
      const from = String(form.get("from") ?? "").trim();
      const to = String(form.get("to") ?? "").trim();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }

    params.set("page", "1");
    router.push(`/history?${params.toString()}`);
  }

  return (
    <form className="mb-6 space-y-4 rounded-lg border border-border bg-muted/30 p-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
        <div className="space-y-2">
          <label htmlFor="history-search" className="text-sm font-medium">Search</label>
          <Input
            id="history-search"
            name="search"
            defaultValue={query.search ?? ""}
            placeholder="Search captions"
            type="search"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="history-status" className="text-sm font-medium">Status</label>
          <select id="history-status" name="status" defaultValue={query.status ?? ""} className={fieldClassName}>
            <option value="">All statuses</option>
            {Object.entries(POST_STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="history-platform" className="text-sm font-medium">Platform</label>
          <select id="history-platform" name="platform" defaultValue={query.platform ?? ""} className={fieldClassName}>
            <option value="">All platforms</option>
            {Object.entries(PLATFORM_META).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_minmax(0,1fr)]">
        <div className="space-y-2">
          <label htmlFor="history-account" className="text-sm font-medium">Account</label>
          <select id="history-account" name="accountId" defaultValue={query.accountId ?? ""} className={fieldClassName}>
            <option value="">All accounts</option>
            {accounts.filter((account) => account.id).map((account) => (
              <option key={account.id} value={account.id ?? ""}>{labelForAccount(account)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="history-date" className="text-sm font-medium">Date</label>
          <select id="history-date" name="datePreset" defaultValue={presetForQuery(query, timeZone)} className={fieldClassName}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="history-from" className="text-sm font-medium">From</label>
          <Input id="history-from" name="from" type="date" defaultValue={query.from ?? ""} />
        </div>
        <div className="space-y-2">
          <label htmlFor="history-to" className="text-sm font-medium">To</label>
          <Input id="history-to" name="to" type="date" defaultValue={query.to ?? ""} />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <label htmlFor="history-sort" className="text-sm font-medium">Sort</label>
          <select id="history-sort" name="sort" defaultValue={query.sort} className={fieldClassName}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="scheduled">Scheduled time</option>
            <option value="published">Published time</option>
          </select>
        </div>
        <div className="flex gap-2">
          {active ? (
            <Button type="button" variant="ghost" onClick={() => router.push("/history")}>
              Clear filters
            </Button>
          ) : null}
          <Button type="submit">Apply filters</Button>
        </div>
      </div>
    </form>
  );
}
