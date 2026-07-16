import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpConfigured: boolean;
  resendApiKey: string;
  resendConfigured: boolean;
  openaiKey: string;
}

export interface GeneralSettings {
  companyName: string;
  website: string;
  signature: string;
  linkedInUrl: string;
  twitterUrl: string;
  whatsApp: string;
  dailyLimit: number;
  warmupEnabled: boolean;
}

interface SettingsState {
  email: EmailSettings;
  general: GeneralSettings;
  isLoading: boolean;
  setEmailSettings: (settings: Partial<EmailSettings>) => void;
  setGeneralSettings: (settings: Partial<GeneralSettings>) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<boolean>;
}

const defaultEmailSettings: EmailSettings = {
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpConfigured: false,
  resendApiKey: '',
  resendConfigured: false,
  openaiKey: '',
};

const defaultGeneralSettings: GeneralSettings = {
  companyName: '',
  website: '',
  signature: '',
  linkedInUrl: '',
  twitterUrl: '',
  whatsApp: '',
  dailyLimit: 50,
  warmupEnabled: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      email: defaultEmailSettings,
      general: defaultGeneralSettings,
      isLoading: false,

      setEmailSettings: (settings) =>
        set((state) => ({
          email: { ...state.email, ...settings },
        })),

      setGeneralSettings: (settings) =>
        set((state) => ({
          general: { ...state.general, ...settings },
        })),

      loadSettings: async () => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/settings');
          if (response.ok) {
            const data = await response.json();
            set({
              email: {
                smtpHost: data.smtpHost || '',
                smtpPort: data.smtpPort || 587,
                smtpUser: data.smtpUser || '',
                smtpPass: '', // Never expose password
                smtpConfigured: data.smtpConfigured || false,
                resendApiKey: data.resendConfigured ? 'configured' : '',
                resendConfigured: data.resendConfigured || false,
                openaiKey: data.openaiKey || '',
              },
              general: {
                companyName: data.companyName || '',
                website: data.website || '',
                signature: data.signature || '',
                linkedInUrl: data.linkedInUrl || '',
                twitterUrl: data.twitterUrl || '',
                whatsApp: data.whatsApp || '',
                dailyLimit: data.dailyLimit || 50,
                warmupEnabled: data.warmupEnabled || false,
              },
            });
          }
        } catch (error) {
          console.error('Failed to load settings:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      saveSettings: async () => {
        const { email, general } = get();
        try {
          const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...email,
              ...general,
            }),
          });
          return response.ok;
        } catch (error) {
          console.error('Failed to save settings:', error);
          return false;
        }
      },
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);