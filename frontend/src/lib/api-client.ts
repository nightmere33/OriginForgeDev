"use client";

/**
 * Browser → Django, same origin (nginx in production, Next rewrites in dev).
 * Session cookie auth: the browser sends it, JS never sees it. Unsafe methods
 * echo the CSRF cookie back as X-CSRFToken.
 */
export type User = {
  id: number;
  email: string;
  full_name: string;
  role: "client" | "developer";
  is_developer: boolean;
  company: string;
  phone: string;
  whatsapp: string;
  country: string;
  language: "en" | "fr" | "ar";
  currency: "DZD" | "EUR" | "USD";
  email_verified: boolean;
  heard_from: string;
  heard_from_detail: string;
  contact_channel: "site" | "whatsapp" | "instagram" | "discord" | "email" | "phone";
  contact_handle: string;
  onboarded: boolean;
  has_password: boolean;
};

export class ApiError extends Error {
  constructor(public status: number, public data: Record<string, unknown>) {
    super(typeof data.detail === "string" ? data.detail : `Request failed (${status})`);
  }

  /** First message for a field, or the general detail. */
  field(name: string): string | undefined {
    const value = this.data[name];
    if (Array.isArray(value)) return String(value[0]);
    if (typeof value === "string") return value;
    return undefined;
  }
}

function csrfToken(): string {
  return document.cookie.match(/(?:^|;\s*)of_csrftoken=([^;]+)/)?.[1] ?? "";
}

let csrfReady: Promise<void> | null = null;
function ensureCsrf() {
  if (csrfToken()) return Promise.resolve();
  csrfReady ??= fetch("/api/auth/csrf/", { credentials: "same-origin" }).then(() => undefined);
  return csrfReady;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const unsafe = method !== "GET";
  if (unsafe) await ensureCsrf();
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    // Per-user data: never from the HTTP cache (that includes cached redirects).
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(unsafe ? { "X-CSRFToken": decodeURIComponent(csrfToken()) } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export async function upload<T>(path: string, file: File, onProgress?: (pct: number) => void): Promise<T> {
  await ensureCsrf();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRFToken", decodeURIComponent(csrfToken()));
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        // Non-JSON error page: keep the empty object.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError(0, { detail: "Network error" }));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
