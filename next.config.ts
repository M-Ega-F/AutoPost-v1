import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis", "postgres"],
  typedRoutes: false,
};

export default nextConfig;
