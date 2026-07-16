export {};

declare global {
  interface Window {
    electronAPI: {
      getAppPath: () => Promise<string>;
      getUserData: () => Promise<Record<string, unknown> | null>;
      setUserData: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      showSaveDialog: (options: {
        title?: string;
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      showOpenDialog: (options: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
      }) => Promise<{ canceled: boolean; filePaths: string[] }>;
      readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
      writeFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>;
      getPlatform: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      dbQuery: (table: string, filters?: Record<string, unknown>) => Promise<{ data: any[]; error: string | null }>;
      dbInsert: (table: string, data: any) => Promise<{ data: any; error: string | null }>;
      dbUpdate: (table: string, id: string, data: any) => Promise<{ success: boolean; error: string | null }>;
      dbDelete: (table: string, id: string) => Promise<{ success: boolean; error: string | null }>;
      emailSend: (job: { id: string; to: string; subject: string; body: string }) => Promise<{ success: boolean; messageId?: string; error?: string }>;
      emailQueue: (job: { id: string; to: string; subject: string; body: string }) => Promise<{ success: boolean; error?: string }>;
      emailTestConnection: () => Promise<{ success: boolean; error?: string }>;
      emailSaveConfig: (config: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string }) => Promise<{ success: boolean; error?: string }>;
    };
  }
}