import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vyora/ui", "@vyora/core"],
  typedRoutes: true,
};

export default nextConfig;
