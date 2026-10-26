import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// Called by Django (content/revalidate.py) after public content changes.
const ALLOWED = /^(site|services|work|work:[a-z0-9-]+|galaxy|tech|credentials|testimonials|faqs|plans|pricing|rates|reviews)$/;

function authorized(header: string | null): boolean {
  const secret = process.env.NEXT_REVALIDATE_SECRET ?? "";
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request.headers.get("x-revalidate-secret"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === "string" && ALLOWED.test(t)) : [];
  for (const tag of tags) revalidateTag(tag, "max");
  return NextResponse.json({ ok: true, revalidated: tags });
}
