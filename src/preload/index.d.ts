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
      // Phase 3
      health: (id: number) => Promise<{ running: boolean; healthy: boolean }>
      logFiles: (id: number) => Promise<{ name: string; size: number; modified: string }[]>
      logContent: (id: number, fileName: string, maxLines?: number) => Promise<{ content: string; totalLines: number; fileName: string }>
      clusterStatus: (id: number) => Promise<{ nodes: { node: string; healthy: boolean }[]; selfNode: string }>
      // 本地配置文件读写
      confFiles: (id: number) => Promise<{ confDir: string; files: { name: string; path: string; size: number; modified: string }[] }>
      readConf: (filePath: string) => Promise<{ content: string; path: string }>
      writeConf: (filePath: string, content: string) => Promise<{ success: boolean; backupPath: string }>
      // Nacos 3.x+ 控制台 URL
      getConsoleUrl: (id: number) => Promise<{ url: string }>
    }
    connection: {
      getAll: () => Promise<any[]>
      add: (connection: any) => Promise<any>
      delete: (id: number) => Promise<boolean>
      upsertLocal: (instanceId: number) => Promise<any>
      healthCheck: (url: string, version?: string) => Promise<{ reachable: boolean; error?: string }>
    }
    shell: {
      openExternal: (url: string) => Promise<void>
      openPath: (path: string) => Promise<string>
    }
    dialog: {
      openDirectory: () => Promise<string | null>
      openFile: (options?: { title?: string; filters?: any[] }) => Promise<{ path: string; content: string } | null>
      saveFile: (options: { title?: string; defaultPath?: string; content: string; filters?: any[] }) => Promise<boolean>
    }
    nacos: {
      request: (options: {
        method?: string
        url: string
        params?: Record<string, any>
        body?: string | Record<string, any>
        headers?: Record<string, string>
      }) => Promise<{ status: number; data: any }>
    }
    system: {
      checkJava: () => Promise<{ installed: boolean; version: string | null }>
      onThemeChange: (callback: (isDark: boolean) => void) => void
    }
    on: (channel: string, callback: (...args: any[]) => void) => void
    off: (channel: string, callback: (...args: any[]) => void) => void
  }
}
