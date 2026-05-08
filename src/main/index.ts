import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { initDatabase, getDatabase, resetStaleInstances } from './database'
import { createTray, destroyTray } from './tray'
import { setupIpcHandlers } from './ipc-handlers'

// 配置日志
log.transports.file.level = 'info'
log.transports.console.level = 'debug'
log.info('Application starting...')

// 全局变量
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// 监听系统主题变化
nativeTheme.on('updated', () => {
  const isDark = nativeTheme.shouldUseDarkColors
  log.info(`System theme changed: ${isDark ? 'dark' : 'light'}`)
  
  // 发送到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system:theme-change', isDark)
  }
})

function createWindow(): void {
  // 根据开发/生产模式解析图标路径
  // 开发模式：app.getAppPath() = 项目根目录，resources/ 在根目录下
  // 生产模式：process.resourcesPath 指向打包后的 resources 目录
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources/icon.png')
  
  log.info(`Window icon path: ${iconPath}`)
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    frame: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 创建应用菜单
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '关于', click: () => mainWindow?.webContents.send('menu:about') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow?.webContents.openDevTools() },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow?.isFullScreen()) }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)

  mainWindow.on('ready-to-show', () => {
    log.info('Main window ready to show')
    mainWindow?.show()
  })

  // 关闭时隐藏到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      log.info('Window hidden to tray')
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发模式加载本地 URL，生产模式加载打包后的文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  log.info('Window created successfully')
}

// 初始化应用
app.whenReady().then(async () => {
  log.info('App ready, initializing...')

  // 设置 app.userAgentFallback 以支持 electron-toolkit
  electronApp.setAppUserModelId('com.nacos.desktop')

  // 初始化数据库
  try {
    await initDatabase()
    log.info('Database initialized successfully')
    // 清扫上次异常退出留下的脏状态
    resetStaleInstances()
  } catch (error) {
    log.error('Failed to initialize database:', error)
  }

  // 注册全局异常处理
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 设置 IPC 处理器
  setupIpcHandlers()
  log.info('IPC handlers registered')

  // 创建主窗口
  createWindow()

  // 创建系统托盘
  tray = createTray(mainWindow!, app)
  log.info('System tray created')

  // 隐藏默认 dock 图标（macOS）
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

// 所有窗口关闭时（Windows/Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 不退出，只是隐藏到托盘
  }
})

// 退出前清理
app.on('before-quit', async () => {
  log.info('Application quitting...')
  ;(app as any).isQuitting = true
  destroyTray()
  
  // 关闭数据库连接
  const db = getDatabase()
  if (db) {
    db.close()
    log.info('Database closed')
  }
})

// 暴露给 IPC 用于显示/隐藏窗口
ipcMain.handle('window:show', () => {
  mainWindow?.show()
  mainWindow?.focus()
})

ipcMain.handle('window:hide', () => {
  mainWindow?.hide()
})

ipcMain.handle('window:is-visible', () => {
  return mainWindow?.isVisible() ?? false
})

log.info('Main process initialized')
