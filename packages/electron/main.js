const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  nativeImage,
} = require("electron");
const path = require("path");
const { uIOhook, UiohookKey } = require("uiohook-napi");

// macOS: hide dock icon (tray-only app)
app.dock?.hide();

let mainWindow = null;
let tray = null;

// --- Double Cmd+C detection via keyboard hook ---
let lastCmdCTime = 0;
const DOUBLE_TAP_INTERVAL = 500; // ms

function startKeyboardWatcher() {
  uIOhook.on("keydown", (e) => {
    // Cmd+C: metaKey + keycode for 'C'
    if (e.metaKey && e.keycode === UiohookKey.C) {
      const now = Date.now();
      if (now - lastCmdCTime < DOUBLE_TAP_INTERVAL) {
        // Double Cmd+C detected — small delay to let the copy complete
        setTimeout(() => {
          const text = clipboard.readText();
          if (text) {
            onDoubleCopy(text);
          }
        }, 100);
        lastCmdCTime = 0; // reset to avoid triple-tap
      } else {
        lastCmdCTime = now;
      }
    }
  });

  uIOhook.start();
}

function onDoubleCopy(text) {
  if (!mainWindow) return;

  mainWindow.webContents.send("append-clipboard", text);
  showWindow();
}

function showWindow() {
  if (!mainWindow) return;

  mainWindow.show();
  mainWindow.focus();
  // macOS: bring to front even if dock is hidden
  app.dock?.show();
  app.focus({ steal: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
  });

  // Load Vite dev server in dev, or built files in production
  const isDev = !app.isPackaged;
  if (isDev) {
    const devPort = process.env.VITE_PORT || "5173";
    mainWindow.loadURL(`http://localhost:${devPort}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  // Hide instead of close
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      app.dock?.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "iconTemplate.png")
  );
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Nansuka");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: showWindow,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", showWindow);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startKeyboardWatcher();
});

app.on("window-all-closed", (e) => {
  // Don't quit on window close (tray app)
  e.preventDefault();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});
