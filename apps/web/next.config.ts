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
  transpilePackages: ["@vyora/ui", "@vyora/core", "@vyora/db", "@vyora/crypto", "@vyora/sync"],
  typedRoutes: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /*
           * Cross-origin isolation, required for SharedArrayBuffer, which
           * sqlite-wasm's synchronous OPFS VFS needs. Without these the local
           * database silently falls back to memory and the day's invoices
           * vanish on reload.
           *
           * The cost is real: COEP blocks every cross-origin subresource that
           * does not opt in via CORP/CORS. Everything the app loads is
           * same-origin today (fonts are self-hosted by next/font), so nothing
           * breaks — but a future third-party script or image will need
           * crossorigin handling rather than a quiet failure.
           */
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
