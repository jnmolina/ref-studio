const { app, BrowserWindow, shell, session, desktopCapturer } = require('electron');
const path = require('path');
const net = require('net');

function getPreferredPort(startPort = 3456) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && startPort < 3470) {
        resolve(getPreferredPort(startPort + 1));
      } else {
        reject(err);
      }
    });
    srv.listen(startPort, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let mainWindow = null;

async function createWindow() {
  const port = await getPreferredPort(3456);
  process.env.PORT = String(port);
  process.env.REFSTUDIO_NO_OPEN = '1';

  // Start the in-memory Express API + static frontend server inside Electron
  require(path.join(__dirname, '../server/bundle.cjs'));

  // Enable getDisplayMedia screen/window capture inside Electron
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
      callback({ video: sources[0] });
    } catch {
      callback({});
    }
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d0e11',
    autoHideMenuBar: true,
    title: 'RefStudio — Reference & Motion Study',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external source links in the OS browser instead of inside the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(`http://127.0.0.1:${port}`) && !url.startsWith(`http://localhost:${port}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
