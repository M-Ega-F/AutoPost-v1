import "server-only";

import {
  disconnectAccount,
  getAccountRecord,
  listAccountSummaries,
} from "@/lib/domain/accounts";
import type { AccountSummary } from "@/lib/domain/types";

export function listAccountsForUser(userId: string): Promise<AccountSummary[]> {
  return listAccountSummaries(userId);
}

export async function getAccountForUser(
  userId: string,
  accountId: string,
): Promise<AccountSummary | null> {
  const account = await getAccountRecord(userId, accountId);
  if (!account || account.status === "disconnected") return null;

  const summary = (await listAccountSummaries(userId)).find(
    (item) => item.id === account.id,
  );
  return summary ?? null;
}

export function disconnectAccountForUser(
  userId: string,
  accountId: string,
): Promise<void> {
  return disconnectAccount(userId, accountId);
}
