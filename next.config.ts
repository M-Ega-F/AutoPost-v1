import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    proxyClientMaxBodySize: "60mb",
  },
  serverExternalPackages: ["bullmq", "ioredis", "postgres"],
  typedRoutes: false,
};

export default nextConfig;
