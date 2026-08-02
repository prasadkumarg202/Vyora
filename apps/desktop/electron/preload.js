// Runs in the page with contextIsolation on. Exposes a tiny, read-only
// surface so the web app can detect it's inside the desktop shell.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("vyoraDesktop", {
  isDesktop: true,
  platform: process.platform,
  shellVersion: process.env.npm_package_version ?? "0.1.0",
});
