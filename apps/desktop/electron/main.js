// Vyora desktop shell.
//
// Loads the hosted Vyora web app in a native window. Vyora is offline-first
// (service worker + local SQLite via OPFS), so after the first online launch
// the app keeps working with no internet — the shell just retries the network
// when it comes back.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");

const DEV = !app.isPackaged;

// Where the Vyora web app lives.
//   - Override at runtime with VYORA_APP_URL (handy for staging).
const PROD_URL = "https://vyora.prasadkumar-g202.workers.dev";
const APP_URL =
  process.env.VYORA_APP_URL || (DEV ? "http://localhost:3000" : PROD_URL);

const APP_ORIGIN = new URL(APP_URL).origin;

/**
 * Where the window opens.
 *
 * Not "/" — that is the public marketing page, and a shopkeeper who has already
 * installed Vyora should not be met by a "Download for Windows" button. The
 * dashboard is the honest front door: middleware sends them to sign-in if they
 * are not signed in, and straight to their counter if they are.
 */
const START_URL = `${APP_ORIGIN}/dashboard`;

/** Minimal inline page shown only if the very first load ever fails offline. */
const OFFLINE_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><title>Vyora — offline</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;display:flex;min-height:100vh;margin:0;
       align-items:center;justify-content:center;background:#fafafa;color:#333}
  .card{max-width:26rem;text-align:center;padding:2rem}
  h1{font-size:1.25rem} p{color:#666;line-height:1.5}
  button{margin-top:1rem;padding:.6rem 1.4rem;border:0;border-radius:.5rem;
         background:#6d4aff;color:#fff;font-size:1rem;cursor:pointer}
</style></head><body><div class="card">
<h1>You're offline</h1>
<p>Vyora needs internet for its first launch. Once loaded, it works fully offline.</p>
<button onclick="location.href='${APP_ORIGIN}/dashboard'">Try again</button>
</div></body></html>`)}`;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    // In the packaged app Windows takes the icon from the .exe itself; the
    // explicit path is only needed for the unpackaged dev window.
    ...(DEV ? { icon: path.join(__dirname, "..", "build", "icon.ico") } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Persistent session so the service worker, OPFS database and login
      // cookies survive restarts — this is what makes offline work.
      partition: "persist:vyora",
    },
  });

  // Links that leave the Vyora origin open in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin !== APP_ORIGIN) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== APP_ORIGIN) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // If the very first load fails (no internet, nothing cached yet), show a
  // friendly retry page instead of Chromium's error screen.
  mainWindow.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    // -3 (ERR_ABORTED) fires on normal SPA navigations — ignore it.
    if (isMainFrame && code !== -3 && url.startsWith(APP_ORIGIN)) {
      mainWindow?.loadURL(OFFLINE_HTML);
    }
  });

  mainWindow.loadURL(START_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Single instance — clicking the icon again focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (!DEV) Menu.setApplicationMenu(null);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
