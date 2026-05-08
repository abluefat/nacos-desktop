import { Tray, Menu, nativeImage, BrowserWindow, App } from 'electron'
import { join } from 'path'
import log from 'electron-log'

let tray: Tray | null = null

/**
 * 创建系统托盘图标
 */
export function createTray(mainWindow: BrowserWindow, app: App): Tray {
  // 根据开发/生产模式解析图标路径
  // 开发模式：app.getAppPath() = 项目根目录，resources/ 在根目录下
  // 生产模式：process.resourcesPath 指向打包后的 resources 目录
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources/icon.png')

  log.info(`Loading tray icon from: ${iconPath}`)
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      log.warn('Tray icon is empty, creating fallback')
      // 创建 16x16 纯色图标作为 fallback
      icon = nativeImage.createFromBuffer(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVQ4T2NkYGD4z0ABYBzVMGwawMjIyMBAAWBiZGT8z0ABYGJkZPjPQAFgYmRk+M9AAWBiZPjPQAFgGnYaAACuGgURekhR8wAAAABJRU5ErkJggg==',
          'base64'
        )
      )
    }
  } catch (e) {
    log.error('Failed to load tray icon:', e)
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Nacos Desktop Manager')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    {
      label: '快速启动',
      submenu: [
        {
          label: '单机模式',
          click: () => {
            mainWindow.webContents.send('tray:quick-start', 'standalone')
            mainWindow.show()
          }
        },
        {
          label: '集群模式',
          click: () => {
            mainWindow.webContents.send('tray:quick-start', 'cluster')
            mainWindow.show()
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '版本管理',
      click: () => {
        mainWindow.webContents.send('tray:navigate', '/version')
        mainWindow.show()
      }
    },
    {
      label: '启动管理',
      click: () => {
        mainWindow.webContents.send('tray:navigate', '/startup')
        mainWindow.show()
      }
    },
    {
      label: '配置管理',
      click: () => {
        mainWindow.webContents.send('tray:navigate', '/config')
        mainWindow.show()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // 双击显示主窗口
  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  log.info('Tray created successfully')
  return tray
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
    log.info('Tray destroyed')
  }
}

/**
 * 更新托盘提示
 */
export function updateTrayTooltip(tooltip: string): void {
  if (tray) {
    tray.setToolTip(tooltip)
  }
}
