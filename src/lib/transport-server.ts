import "server-only";

import { headers } from "next/headers";

import {
  transportCorrelationFromHeaders,
  type TransportCorrelation,
} from "@/lib/transport";

/** Reads proxy-added transport metadata without exposing raw request headers. */
export async function readServerTransportCorrelation(): Promise<TransportCorrelation | undefined> {
  try {
    return transportCorrelationFromHeaders(await headers());
  } catch {
    // Unit tests and non-request server work do not have Next request headers.
    return undefined;
  }
}
