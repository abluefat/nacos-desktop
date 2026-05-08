import { ElectronAPI } from '@electron-toolkit/preload'

interface Window {
  electron: ElectronAPI
  api: {
    window: {
      show: () => Promise<void>
      hide: () => Promise<void>
      isVisible: () => Promise<boolean>
    }
    app: {
      getPath: (name: string) => Promise<string>
      getVersion: () => Promise<string>
    }
    version: {
      getLocal: () => Promise<any[]>
      add: (version: any) => Promise<any>
      delete: (id: number) => Promise<boolean>
      batchDelete: (ids: number[]) => Promise<any[]>
      getVersionsPath: () => Promise<string>
      getReleases: () => Promise<any[]>
      download: (version: string, url: string) => Promise<{ success: boolean; path: string; message?: string }>
      cancelDownload: (version: string) => Promise<{ success: boolean }>
    }
    settings: {
      get: () => Promise<{ versionsPath: string; downloadPath: string; defaultVersionsPath: string }>
      setVersionsPath: (path: string) => Promise<{ success: boolean }>
      setDownloadPath: (path: string) => Promise<{ success: boolean }>
    }
    instance: {
      getAll: () => Promise<any[]>
      getById: (id: number) => Promise<any>
      create: (instance: any) => Promise<any>
      update: (id: number, updates: any) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
      start: (id: number) => Promise<{ success: boolean; pid: number }>
      stop: (id: number) => Promise<{ success: boolean }>
      isRunning: (id: number) => Promise<boolean>
      getInstancesPath: () => Promise<string>
    }
    connection: {
      getAll: () => Promise<any[]>
      add: (connection: any) => Promise<any>
      delete: (id: number) => Promise<boolean>
    }
    shell: {
      openExternal: (url: string) => Promise<void>
      openPath: (path: string) => Promise<string>
    }
    dialog: {
      openDirectory: () => Promise<string | null>
    }
    system: {
      checkJava: () => Promise<{ installed: boolean; version: string | null }>
    }
    on: (channel: string, callback: (...args: any[]) => void) => void
    off: (channel: string, callback: (...args: any[]) => void) => void
  }
}
