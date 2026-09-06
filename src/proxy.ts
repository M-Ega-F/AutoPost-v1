import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";

/**
 * Route-aware auth gate.
 *
 * `/` (the public landing page) and `/login` are open to everyone. Every other
 * page needs a session and is redirected to `/login?next=<original url>`.
 * `/api/*` is deliberately left alone: Route Handlers answer `401` themselves,
 * because a 303 to an HTML login page is useless to a `fetch` caller.
 */
const PUBLIC_PAGE_ROUTES = new Set(["/", "/login", "/signup"]);

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_ROUTES.has(pathname);
}

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api");

  if (!user && !isPublicPage(pathname) && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const requested = request.nextUrl.searchParams.get("next");
    const url = request.nextUrl.clone();
    url.pathname = safeNextPath(requested);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
