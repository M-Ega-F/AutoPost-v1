import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { logger } from "@/lib/logger";
import {
  classifyTransport,
  TRANSPORT_ID_HEADER,
  TRANSPORT_KIND_HEADER,
} from "@/lib/transport";

/**
 * Route-aware auth gate.
 *
 * `/` (the public landing page) and `/login` are open to everyone. Every other
 * page needs a session and is redirected to `/login?next=<original url>`.
 * `/api/*` is deliberately left alone: Route Handlers answer `401` themselves,
 * because a 303 to an HTML login page is useless to a `fetch` caller.
 */
const PUBLIC_PAGE_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
]);

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_ROUTES.has(pathname);
}

export default async function proxy(request: NextRequest) {
  const transportId = crypto.randomUUID();
  const { pathname, search } = request.nextUrl;
  const transport = classifyTransport({
    method: request.method,
    pathname,
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  });
  let responseStatus = 200;
  const startedAt = performance.now();

  function nextResponse() {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(TRANSPORT_ID_HEADER, transportId);
    requestHeaders.set(TRANSPORT_KIND_HEADER, transport.kind);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = nextResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>,
        ) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = nextResponse();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the session cookies on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isApi = pathname.startsWith("/api");

  if (!user && !isPublicPage(pathname) && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(url);
    responseStatus = redirect.status;
    logger.info("[PERF][transport]", {
      transportId,
      requestKind: transport.kind,
      method: request.method,
      pathname,
      hasQuery: transport.hasQuery,
      rsc: transport.rsc,
      prefetch: transport.prefetch,
      serverAction: transport.serverAction,
      status: responseStatus,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return redirect;
  }

  if (user && pathname === "/login") {
    const requested = request.nextUrl.searchParams.get("next");
    const url = request.nextUrl.clone();
    url.pathname = safeNextPath(requested);
    url.search = "";
    const redirect = NextResponse.redirect(url);
    responseStatus = redirect.status;
    logger.info("[PERF][transport]", {
      transportId,
      requestKind: transport.kind,
      method: request.method,
      pathname,
      hasQuery: transport.hasQuery,
      rsc: transport.rsc,
      prefetch: transport.prefetch,
      serverAction: transport.serverAction,
      status: responseStatus,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return redirect;
  }

  logger.info("[PERF][transport]", {
    transportId,
    requestKind: transport.kind,
    method: request.method,
    pathname,
    hasQuery: transport.hasQuery,
    rsc: transport.rsc,
    prefetch: transport.prefetch,
    serverAction: transport.serverAction,
    status: responseStatus,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
