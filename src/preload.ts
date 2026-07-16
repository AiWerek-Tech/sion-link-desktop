import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sionLink', {
  connect: (data: { ip: string; port: number; code: string; remember: boolean }) =>
    ipcRenderer.invoke('connect', data),
  getSavedConfig: () => ipcRenderer.invoke('get-saved-config'),
  clearSavedConfig: () => ipcRenderer.invoke('clear-saved-config'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  getStartupNotice: () => ipcRenderer.invoke('get-startup-notice'),
  scanNetwork: (port: number) => ipcRenderer.invoke('scan-network', port),
  startPresentationBridge: (data: { ip: string; port: number; engine?: 'dotnet_agent' | 'legacy_powershell' }) =>
    ipcRenderer.invoke('presentation-bridge:start', data),
  stopPresentationBridge: () => ipcRenderer.invoke('presentation-bridge:stop'),
  getPresentationBridgeStatus: () => ipcRenderer.invoke('presentation-bridge:status'),
  onPresentationBridgeStatus: (cb: (data: unknown) => void) => {
    const listener = (_e: unknown, data: unknown) => cb(data)
    ipcRenderer.on('presentation-bridge:status', listener)
    return () => ipcRenderer.removeListener('presentation-bridge:status', listener)
  },
  onScanProgress: (cb: (data: { scanned: number; total: number; found: number }) => void) => {
    const listener = (_e: unknown, data: { scanned: number; total: number; found: number }) => cb(data)
    ipcRenderer.on('scan-progress', listener as any)
    return () => ipcRenderer.removeListener('scan-progress', listener as any)
  }
})
