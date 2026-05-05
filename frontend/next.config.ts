import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  compiler: {
    // Remove console logs in production for better performance
    removeConsole: process.env.NODE_ENV === "production",
  },

  experimental: {
    // Disable CSS chunking — merges all CSS into one bundle so Next.js never
    // emits separate CSS chunk preloads that time out with "preloaded but not
    // used within a few seconds from the window's load event".
    cssChunking: false,
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
