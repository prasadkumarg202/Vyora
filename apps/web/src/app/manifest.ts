import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vyora — Business OS",
    short_name: "Vyora",
    description:
      "Billing, inventory and GST for Indian MSMEs. Works offline, syncs later.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // sRGB equivalents of the canvas and dark-header-band tokens. The manifest
    // spec predates oklch, so these must be hex.
    background_color: "#f6f6f9",
    theme_color: "#181928",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
