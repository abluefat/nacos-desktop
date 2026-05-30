import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 自定义 APIs（渲染进程调用主进程的桥梁）
const api = {
  // 窗口控制
  window: {
    show: () => ipcRenderer.invoke('window:show'),
    hide: () => ipcRenderer.invoke('window:hide'),
    isVisible: () => ipcRenderer.invoke('window:is-visible')
  },

  // 应用信息
  app: {
    getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
    getVersion: () => ipcRenderer.invoke('app:get-version')
  },

  // 版本管理
  version: {
    getLocal: () => ipcRenderer.invoke('version:get-local'),
    add: (version: any) => ipcRenderer.invoke('version:add', version),
    delete: (id: number) => ipcRenderer.invoke('version:delete', id),
    batchDelete: (ids: number[]) => ipcRenderer.invoke('version:batch-delete', ids),
    getVersionsPath: () => ipcRenderer.invoke('version:get-versions-path'),
    getReleases: () => ipcRenderer.invoke('version:get-releases'),
    download: (version: string, url: string) => ipcRenderer.invoke('version:download', version, url),
    cancelDownload: (version: string) => ipcRenderer.invoke('version:cancel-download', version)
  },

  // 设置管理
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setVersionsPath: (path: string) => ipcRenderer.invoke('settings:set-versions-path', path),
    setDownloadPath: (path: string) => ipcRenderer.invoke('settings:set-download-path', path)
  },

  // 实例管理
  instance: {
    getAll: () => ipcRenderer.invoke('instance:get-all'),
    getById: (id: number) => ipcRenderer.invoke('instance:get-by-id', id),
    create: (instance: any) => ipcRenderer.invoke('instance:create', instance),
    update: (id: number, updates: any) => ipcRenderer.invoke('instance:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('instance:delete', id),
    start: (id: number) => ipcRenderer.invoke('instance:start', id),
    stop: (id: number) => ipcRenderer.invoke('instance:stop', id),
    isRunning: (id: number) => ipcRenderer.invoke('instance:is-running', id),
    getInstancesPath: () => ipcRenderer.invoke('instance:get-instances-path'),
    // Phase 3 新增
    health: (id: number) => ipcRenderer.invoke('instance:health', id),
    logFiles: (id: number) => ipcRenderer.invoke('instance:log-files', id),
    logContent: (id: number, fileName: string, maxLines?: number) => ipcRenderer.invoke('instance:log-content', id, fileName, maxLines),
    clusterStatus: (id: number) => ipcRenderer.invoke('instance:cluster-status', id),
    // 本地配置文件读写
    confFiles: (id: number) => ipcRenderer.invoke('instance:conf-files', id),
    readConf: (filePath: string) => ipcRenderer.invoke('instance:read-conf', filePath),
    writeConf: (filePath: string, content: string) => ipcRenderer.invoke('instance:write-conf', filePath, content),
    // Nacos 3.x+ 控制台 URL
    getConsoleUrl: (id: number) => ipcRenderer.invoke('instance:get-console-url', id),
    detectAllStatus: () => ipcRenderer.invoke('instance:detect-all-status')
  },

  // 连接管理
  connection: {
    getAll: () => ipcRenderer.invoke('connection:get-all'),
    add: (connection: any) => ipcRenderer.invoke('connection:add', connection),
    delete: (id: number) => ipcRenderer.invoke('connection:delete', id),
    upsertLocal: (instanceId: number) => ipcRenderer.invoke('connection:upsert-local', instanceId),
    healthCheck: (url: string, version?: string) => ipcRenderer.invoke('connection:health-check', url, version)
  },

  // 系统工具
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path)
  },

  // 对话框
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
    openFile: (options?: { title?: string; filters?: any[] }) => ipcRenderer.invoke('dialog:open-file', options),
    saveFile: (options: { title?: string; defaultPath?: string; content: string; filters?: any[] }) => ipcRenderer.invoke('dialog:save-file', options)
  },

  // Nacos HTTP 代理（绕过渲染进程 CORS 限制）
  nacos: {
    request: (options: {
      method?: string
      url: string
      params?: Record<string, any>
      body?: string | Record<string, any>
      headers?: Record<string, string>
    }) => ipcRenderer.invoke('nacos:request', options)
  },

  // 系统检测
  system: {
    checkJava: () => ipcRenderer.invoke('system:check-java'),
    onThemeChange: (callback: (isDark: boolean) => void) => {
      ipcRenderer.on('system:theme-change', (_, isDark) => callback(isDark))
    }
  },

  // 事件监听
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'tray:navigate',
      'tray:quick-start',
      'instance:log',
      'instance:status-changed',
      'menu:about',
      'download:progress',
      'system:theme-change'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args))
    }
  },

  // 移除事件监听
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  }
}

// 使用 contextBridge 暴露 APIs
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
