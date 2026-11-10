import type { NextConfig } from "next";

const fe51BackendOrigin = process.env.FE51_BACKEND_ORIGIN;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async rewrites() {
    if (!fe51BackendOrigin) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${fe51BackendOrigin}/api/:path*`,
      },
      {
        source: "/health/:path*",
        destination: `${fe51BackendOrigin}/health/:path*`,
      },
    ];
  },
};

export default nextConfig;
