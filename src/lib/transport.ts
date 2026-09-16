export const TRANSPORT_ID_HEADER = "x-autopost-transport-id";
export const TRANSPORT_KIND_HEADER = "x-autopost-transport-kind";

export type TransportKind =
  | "DOCUMENT"
  | "RSC"
  | "PREFETCH"
  | "SERVER_ACTION"
  | "API"
  | "UNKNOWN";

export type TransportSignals = {
  kind: TransportKind;
  rsc: boolean;
  prefetch: boolean;
  serverAction: boolean;
  hasQuery: boolean;
};

export type TransportCorrelation = {
  transportId: string;
  transportKind: TransportKind;
};

const TRANSPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSPORT_KINDS = new Set<TransportKind>([
  "DOCUMENT",
  "RSC",
  "PREFETCH",
  "SERVER_ACTION",
  "API",
  "UNKNOWN",
]);

type HeaderReader = Pick<Headers, "get" | "has">;

function isPrefetchSignal(headers: HeaderReader): boolean {
  const routerPrefetch = headers.get("next-router-prefetch");
  const purpose = headers.get("purpose") ?? headers.get("x-purpose");
  return (
    routerPrefetch === "1" ||
    routerPrefetch === "2" ||
    routerPrefetch === "3" ||
    purpose?.toLowerCase().includes("prefetch") === true
  );
}

export function classifyTransport({
  method,
  pathname,
  searchParams,
  headers,
}: {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  headers: HeaderReader;
}): TransportSignals {
  const normalizedMethod = method.toUpperCase();
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  const rsc = headers.get("rsc") === "1" || searchParams.has("_rsc");
  const prefetch = isPrefetchSignal(headers);
  const serverAction = normalizedMethod === "POST" && headers.has("next-action");

  let kind: TransportKind = "UNKNOWN";
  if (isApi) kind = "API";
  else if (serverAction) kind = "SERVER_ACTION";
  else if (prefetch) kind = "PREFETCH";
  else if (rsc) kind = "RSC";
  else if (normalizedMethod === "GET") kind = "DOCUMENT";

  return {
    kind,
    rsc,
    prefetch,
    serverAction,
    hasQuery: searchParams.toString().length > 0,
  };
}

export function transportCorrelationFromHeaders(
  headers: HeaderReader,
): TransportCorrelation | undefined {
  const transportId = headers.get(TRANSPORT_ID_HEADER);
  const transportKind = headers.get(TRANSPORT_KIND_HEADER) as TransportKind | null;
  if (!transportId || !TRANSPORT_ID_PATTERN.test(transportId)) return undefined;
  if (!transportKind || !TRANSPORT_KINDS.has(transportKind)) return undefined;
  return { transportId, transportKind };
}
