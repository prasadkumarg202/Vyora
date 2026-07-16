import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  // A service worker caching stale routes makes dev confusing.
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Internal packages ship TypeScript source and are compiled by the app.
  transpilePackages: ["@vyora/ui", "@vyora/core"],
  typedRoutes: true,
};

export default withSerwist(nextConfig);
