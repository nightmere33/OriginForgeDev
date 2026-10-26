import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// Django serves the API and /media. In production nginx routes both before
// Next sees them; in development these rewrites make the browser talk to one
// origin, so session and CSRF cookies behave exactly as they will live.
const API_ORIGIN = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:8000";
const MEDIA_ORIGIN = new URL(process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? API_ORIGIN);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: MEDIA_ORIGIN.protocol.replace(":", "") as "http" | "https",
        hostname: MEDIA_ORIGIN.hostname,
        port: MEDIA_ORIGIN.port,
        pathname: "/media/**",
      },
    ],
    qualities: [70, 82],
    formats: ["image/avif", "image/webp"],
    // Development only: Django media lives on 127.0.0.1.
    dangerouslyAllowLocalIP: isDev,
  },
  // Django's URLs end in "/"; keep the slash the client sent instead of
  // redirecting it away (a redirected POST would lose its body).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Plain array = afterFiles: app routes such as /api/revalidate win first.
    return [
      // Path params drop the trailing slash, so it is matched and re-added explicitly.
      { source: "/api/:path*/", destination: `${API_ORIGIN}/api/:path*/` },
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      { source: "/media/:path*", destination: `${API_ORIGIN}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
