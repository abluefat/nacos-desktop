# Nacos Desktop Manager

![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Electron](https://img.shields.io/badge/Electron-28.3.3-47848F)
![Vue](https://img.shields.io/badge/Vue-3.4-42b883)
![License](https://img.shields.io/badge/License-MIT-green)

> 跨平台 Nacos 版本管理与配置工具，一站式搞定 Nacos 的安装、启动、配置 CRUD。当前版本仅支持3.0以下的 Nacos 版本。

---

## 功能特性

### 版本管理
- 从 GitHub Releases 自动拉取所有正式版 Nacos
- 一键下载 & 自动解压安装（Windows zip / macOS&Linux tar.gz）
- 本地版本列表管理，支持批量删除（含磁盘文件清理）

### 启动管理
- 创建多个 Nacos 实例（单实例 / 集群模式）
- 独立配置端口、JVM 内存（Xms/Xmx）、启动模式、集群节点
- 一键启动 / 停止，实时日志输出
- 健康状态检测，集群节点状态一目了然
- 进程管理，崩溃自动感知

### 配置管理
- 添加多个 Nacos 连接，支持命名空间切换
- 配置列表：分页、搜索、排序
- 配置编辑器：YAML / JSON 格式，带语法高亮（CodeMirror）和格式化
- 新增 / 编辑 / 删除 / 导出 / 批量导入配置
- 配置变更历史查看
- 登录认证（用户名 + token）

### 系统托盘
- 最小化到托盘，不占任务栏
- 托盘菜单快速访问各模块
- 关闭按钮可选：退出应用 或 最小化到托盘

### 主题
- 浅色模式 / 深色模式 / 跟随系统，三种主题自由切换
- Element Plus 全组件深色适配

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 28 + electron-vite |
| 前端 | Vue 3 + TypeScript + Vite + Pinia + Vue Router |
| UI 组件 | Element Plus |
| 代码编辑器 | CodeMirror 6（支持 YAML / JSON 语法高亮） |
| 本地存储 | SQLite（sql.js）+ electron-store |
| 日志 | electron-log |
| 打包 | electron-builder |

---

## 快速开始

### 开发模式

```bash
# 克隆项目
git clone https://github.com/your-name/nacos-desktop.git
cd nacos-desktop

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 打包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# 多平台
npm run build:all
```

打包产物位于 `dist/` 目录：
- `Nacos Desktop Manager-x.x.x-win-x64.exe` — NSIS 安装程序
- `Nacos Desktop Manager-x.x.x-portable.exe` — 绿色便携版

---

## 目录结构

```
nacos-desktop/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 入口：窗口管理、系统托盘、主题监听
│   │   ├── ipc-handlers.ts   # 所有 IPC 处理器（进程管理/下载/HTTP代理等）
│   │   ├── database.ts        # SQLite 数据库操作
│   │   └── tray.ts            # 托盘菜单与图标
│   ├── preload/
│   │   └── index.ts          # 预加载脚本：暴露安全 IPC API
│   └── renderer/             # 渲染进程（Vue 3 应用）
│       └── src/
│           ├── views/        # 页面视图
│           │   ├── VersionView.vue   # 版本管理
│           │   ├── StartupView.vue   # 启动管理
│           │   └── ConfigView.vue    # 配置管理
│           ├── stores/        # Pinia 状态管理
│           │   └── theme.ts   # 主题状态
│           ├── router/        # 路由配置
│           ├── components/    # 公共组件
│           ├── App.vue        # 根组件
│           └── main.ts       # Vue 应用入口
├── resources/               # 应用图标（icon.png / icon.ico / icon.icns）
├── scripts/                 # 打包辅助脚本
│   ├── build-win.js          # Windows 打包（含工具缓存）
│   └── setup-wcs-cache.js    # winCodeSign 工具缓存
├── electron.vite.config.ts   # electron-vite 配置
└── package.json
```

---

## 注意事项

- 启动 Nacos 前请确保已安装 **JDK 8+** 并正确配置 `JAVA_HOME` 环境变量
- 集群模式启动需要在工作目录下预先配置 `cluster.conf` 和 MySQL 连接信息
- 应用数据（版本列表、实例配置、连接信息）存储在 `electron-store` 本地配置目录
