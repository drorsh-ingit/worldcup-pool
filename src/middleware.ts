import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/signup");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  // Cron routes are called by Vercel with no session cookie; they authenticate
  // themselves via the CRON_SECRET bearer token, so skip the login redirect.
  const isCron = req.nextUrl.pathname.startsWith("/api/cron");
  const isPublic = req.nextUrl.pathname === "/" || req.nextUrl.pathname === "/countdown";

  // Allow API auth + cron routes through
  if (isApiAuth || isCron) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Redirect unauthenticated users to login (except public + auth pages)
  if (!isLoggedIn && !isAuthPage && !isPublic) {
    const redirectUrl = new URL("/login", req.url);
    redirectUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logos/|.*\\.webp|.*\\.png).*)"],
};
