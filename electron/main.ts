import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let store: any = null;

function getStore() {
  if (store) return store;
  const Store = require('electron-store');
  store = new Store({
    name: 'exportreach-data',
    defaults: {
      users: [],
      settings: {},
      leads: [],
      campaigns: [],
      emailTemplates: [],
      emailQueue: [],
      analytics: [],
    },
  });
  return store;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'ExportReach Pro',
    backgroundColor: '#f8fafc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:3000') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});

function encrypt(text: string): string {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return key.toString('hex') + ':' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted text');
  const key = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encrypted = parts[3];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('get-user-data', () => {
  const userDataPath = app.getPath('userData');
  const dataFile = path.join(userDataPath, 'user-data.json');

  if (fs.existsSync(dataFile)) {
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  }
  return null;
});

ipcMain.handle('set-user-data', async (_, data: object) => {
  const userDataPath = app.getPath('userData');
  const dataFile = path.join(userDataPath, 'user-data.json');

  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('show-save-dialog', async (_, options: Electron.SaveDialogOptions) => {
  if (!mainWindow) return { canceled: true };
  return dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('show-open-dialog', async (_, options: Electron.OpenDialogOptions) => {
  if (!mainWindow) return { canceled: true };
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('read-file', async (_, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath);
    return { success: true, data: content.toString('base64') };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('write-file', async (_, filePath: string, data: string) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('db:query', async (_, { table, filters }: { table: string; filters?: Record<string, any> }) => {
  try {
    const s = getStore();
    let data = s.get(table, []);
    if (!Array.isArray(data)) data = [];

    if (filters) {
      data = data.filter((item: any) => {
        return Object.entries(filters).every(([key, value]) => item[key] === value);
      });
    }

    return { data, error: null };
  } catch (error) {
    return { data: [], error: String(error) };
  }
});

ipcMain.handle('db:insert', async (_, { table, data }: { table: string; data: any }) => {
  try {
    const s = getStore();
    const existing = s.get(table, []);
    if (!Array.isArray(existing)) {
      s.set(table, [data]);
    } else {
      s.set(table, [...existing, data]);
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: String(error) };
  }
});

ipcMain.handle('db:update', async (_, { table, id, data }: { table: string; id: string; data: any }) => {
  try {
    const s = getStore();
    const existing = s.get(table, []);
    if (!Array.isArray(existing)) return { success: false, error: 'Not an array' };

    const index = existing.findIndex((item: any) => item.id === id);
    if (index === -1) return { success: false, error: 'Not found' };

    existing[index] = { ...existing[index], ...data };
    s.set(table, existing);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('db:delete', async (_, { table, id }: { table: string; id: string }) => {
  try {
    const s = getStore();
    const existing = s.get(table, []);
    if (!Array.isArray(existing)) return { success: false, error: 'Not an array' };

    const filtered = existing.filter((item: any) => item.id !== id);
    s.set(table, filtered);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('email:send', async (_, job: { id: string; to: string; subject: string; body: string }) => {
  try {
    const s = getStore();
    const settings = s.get('settings', {}) as any;

    if (!settings.smtpHost) {
      return { success: false, error: 'SMTP not configured' };
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpPort === 465,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassEncrypted ? decrypt(settings.smtpPassEncrypted) : '',
      },
    });

    const result = await transporter.sendMail({
      from: settings.smtpUser,
      to: job.to,
      subject: job.subject,
      html: job.body,
    });

    const queue = s.get('emailQueue', []) as any[];
    const updatedQueue = queue.map((item: any) =>
      item.id === job.id ? { ...item, status: 'sent', messageId: result.messageId, sentAt: new Date().toISOString() } : item
    );
    s.set('emailQueue', updatedQueue);

    return { success: true, messageId: result.messageId };
  } catch (error) {
    const s = getStore();
    const queue = s.get('emailQueue', []) as any[];
    const updatedQueue = queue.map((item: any) =>
      item.id === job.id ? { ...item, status: 'failed', error: String(error) } : item
    );
    s.set('emailQueue', updatedQueue);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('email:queue', async (_, job: { id: string; to: string; subject: string; body: string }) => {
  try {
    const s = getStore();
    const queue = s.get('emailQueue', []) as any[];
    s.set('emailQueue', [...queue, { ...job, status: 'pending', createdAt: new Date().toISOString() }]);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('email:test-connection', async () => {
  try {
    const s = getStore();
    const settings = s.get('settings', {}) as any;

    if (!settings.smtpHost) {
      return { success: false, error: 'SMTP not configured' };
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpPort === 465,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassEncrypted ? decrypt(settings.smtpPassEncrypted) : '',
      },
    });

    await transporter.verify();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('email:save-config', async (_, config: {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}) => {
  try {
    const s = getStore();
    const settings = s.get('settings', {}) as any;
    s.set('settings', {
      ...settings,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUser: config.smtpUser,
      smtpPassEncrypted: config.smtpPass ? encrypt(config.smtpPass) : '',
      smtpConfigured: true,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});