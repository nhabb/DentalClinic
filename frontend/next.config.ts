import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser compatibility settings
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
