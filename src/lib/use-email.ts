import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface EmailJob {
  id: string;
  to: string;
  subject: string;
  body: string;
}

interface UseEmailReturn {
  sendEmail: (to: string, subject: string, body: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  queueEmail: (to: string, subject: string, body: string) => Promise<{ success: boolean; error?: string }>;
  testConnection: () => Promise<{ success: boolean; error?: string }>;
  saveConfig: (config: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string }) => Promise<{ success: boolean; error?: string }>;
  isElectron: boolean;
}

export function useEmail(): UseEmailReturn {
  const [isElectron] = useState(() => typeof window !== 'undefined' && !!window.electronAPI);

  const sendEmail = useCallback(
    async (to: string, subject: string, body: string) => {
      const job: EmailJob = {
        id: uuidv4(),
        to,
        subject,
        body,
      };

      if (isElectron && window.electronAPI) {
        return window.electronAPI.emailSend(job);
      }

      try {
        const response = await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(job),
        });

        return await response.json();
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    [isElectron]
  );

  const queueEmail = useCallback(
    async (to: string, subject: string, body: string) => {
      const job: EmailJob = {
        id: uuidv4(),
        to,
        subject,
        body,
      };

      if (isElectron && window.electronAPI) {
        return window.electronAPI.emailQueue(job);
      }

      try {
        const response = await fetch('/api/emails/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(job),
        });

        return await response.json();
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    [isElectron]
  );

  const testConnection = useCallback(async () => {
    if (isElectron && window.electronAPI) {
      return window.electronAPI.emailTestConnection();
    }

    try {
      const response = await fetch('/api/emails/test-connection', {
        method: 'POST',
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, [isElectron]);

  const saveConfig = useCallback(
    async (config: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string }) => {
      if (isElectron && window.electronAPI) {
        return window.electronAPI.emailSaveConfig(config);
      }

      try {
        const response = await fetch('/api/settings/smtp', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });

        return await response.json();
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    [isElectron]
  );

  return {
    sendEmail,
    queueEmail,
    testConnection,
    saveConfig,
    isElectron,
  };
}