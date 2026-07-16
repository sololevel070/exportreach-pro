'use client';

import { useEffect, useState } from 'react';

export function useElectron() {
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const checkElectron = async () => {
      if (window.electronAPI) {
        setIsElectronApp(true);

        try {
          const [platformResult, versionResult, dataResult] = await Promise.all([
            window.electronAPI.getPlatform(),
            window.electronAPI.getAppVersion(),
            window.electronAPI.getUserData(),
          ]);

          setPlatform(platformResult);
          setAppVersion(versionResult);
          setUserData(dataResult);
        } catch (error) {
          console.error('Error initializing Electron:', error);
        }
      }
    };

    checkElectron();
  }, []);

  const saveUserData = async (data: Record<string, unknown>) => {
    if (window.electronAPI) {
      return window.electronAPI.setUserData(data);
    }
    return { success: false, error: 'Not in Electron' };
  };

  const showSaveDialog = async (options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => {
    if (window.electronAPI) {
      return window.electronAPI.showSaveDialog(options);
    }
    return { canceled: true };
  };

  const showOpenDialog = async (options: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
  }) => {
    if (window.electronAPI) {
      return window.electronAPI.showOpenDialog(options);
    }
    return { canceled: true, filePaths: [] };
  };

  return {
    isElectronApp,
    platform,
    appVersion,
    userData,
    saveUserData,
    showSaveDialog,
    showOpenDialog,
  };
}