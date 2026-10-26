import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["en", "fr"];

// Every page lives under /en or /fr. A bare path is sent to the visitor's
// language: an explicit earlier choice (cookie) first, then the browser's
// Accept-Language, then English.
function preferredLocale(request: NextRequest): string {
  const saved = request.cookies.get("of_lang")?.value;
  if (saved && LOCALES.includes(saved)) return saved;
  const header = request.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (LOCALES.includes(code)) return code;
  }
  return "en";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;
  const url = request.nextUrl.clone();
  url.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API (proxied to Django), Next internals, media and files with an extension.
  matcher: ["/((?!api|_next|media|brand|.*\\..*).*)"],
};
