import type { NextConfig } from "next";

/**
 * Where /api/* is forwarded. The browser only ever talks to this site, so the
 * session cookie the API sets is first-party here (cross-site cookies are
 * blocked by Safari and increasingly by Chrome). API_PROXY_TARGET names the
 * backend; NEXT_PUBLIC_API_URL, the older setting that held the same URL, is
 * accepted so existing deployments keep working. Empty means something in
 * front of this app already routes /api (nginx in docker-compose).
 */
const apiTarget = (
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  ""
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",

  async rewrites() {
    if (!apiTarget) return [];
    return [{ source: "/api/:path*", destination: `${apiTarget}/api/:path*` }];
  },
  compiler: {
    // Remove console logs in production for better performance
    removeConsole: process.env.NODE_ENV === "production",
  },

  // Headers for better browser compatibility
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
