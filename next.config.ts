import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser compatibility settings
  compiler: {
    // Remove console logs in production for better performance
    removeConsole: process.env.NODE_ENV === "production",
  },

  // Enable experimental features for better browser support
  experimental: {
    // Optimize CSS for better cross-browser compatibility
    optimizeCss: true,
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
