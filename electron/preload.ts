import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getUserData: () => ipcRenderer.invoke('get-user-data'),
  setUserData: (data: object) => ipcRenderer.invoke('set-user-data', data),
  showSaveDialog: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('show-open-dialog', options),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, data: string) => ipcRenderer.invoke('write-file', filePath, data),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  dbQuery: (table: string, filters?: Record<string, any>) => ipcRenderer.invoke('db:query', { table, filters }),
  dbInsert: (table: string, data: any) => ipcRenderer.invoke('db:insert', { table, data }),
  dbUpdate: (table: string, id: string, data: any) => ipcRenderer.invoke('db:update', { table, id, data }),
  dbDelete: (table: string, id: string) => ipcRenderer.invoke('db:delete', { table, id }),
  emailSend: (job: { id: string; to: string; subject: string; body: string }) => ipcRenderer.invoke('email:send', job),
  emailQueue: (job: { id: string; to: string; subject: string; body: string }) => ipcRenderer.invoke('email:queue', job),
  emailTestConnection: () => ipcRenderer.invoke('email:test-connection'),
  emailSaveConfig: (config: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string }) =>
    ipcRenderer.invoke('email:save-config', config),
});