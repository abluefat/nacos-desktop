<template>
  <div class="app-container" :class="{ 'is-dark': isDark }">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <el-icon :size="28"><Box /></el-icon>
          <span class="title">Nacos Desktop</span>
        </div>
        <div class="version-tag">v{{ appVersion }}</div>
      </div>

      <el-menu
        :default-active="activeRoute"
        class="sidebar-menu"
        router
        @select="handleMenuSelect"
      >
        <el-menu-item index="/version">
          <el-icon><Collection /></el-icon>
          <span>版本管理</span>
        </el-menu-item>
        <el-menu-item index="/startup">
          <el-icon><VideoPlay /></el-icon>
          <span>启动管理</span>
        </el-menu-item>
        <el-menu-item index="/config">
          <el-icon><Setting /></el-icon>
          <span>配置管理</span>
        </el-menu-item>
      </el-menu>

      <div class="sidebar-footer">
        <!-- 主题切换 -->
        <div class="theme-switch" @click="themeStore.toggleTheme()">
          <el-icon :size="18">
            <component :is="themeIcon" />
          </el-icon>
          <span>{{ themeLabel }}</span>
        </div>

        <div class="java-status" :class="{ 'has-java': javaStatus.installed }">
          <el-icon><Monitor /></el-icon>
          <span>{{ javaStatus.installed ? `Java ${javaStatus.version}` : '未检测到 Java' }}</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useThemeStore } from './stores/theme'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()

const appVersion = ref('1.0.0')
const javaStatus = ref({ installed: false, version: null as string | null })

const activeRoute = computed(() => route.path)
const isDark = computed(() => themeStore.effectiveTheme === 'dark')

// 主题图标
const themeIcon = computed(() => {
  switch (themeStore.themeMode) {
    case 'light':
      return markRaw({ render: () => null })
    case 'dark':
      return markRaw({ render: () => null })
    case 'system':
      return markRaw({ render: () => null })
    default:
      return markRaw({ render: () => null })
  }
})

// 主题标签
const themeLabel = computed(() => {
  switch (themeStore.themeMode) {
    case 'light':
      return '浅色模式'
    case 'dark':
      return '深色模式'
    case 'system':
      return '跟随系统'
    default:
      return '浅色模式'
  }
})

// 检测 Java 环境
async function checkJava() {
  try {
    javaStatus.value = await window.api.system.checkJava()
  } catch (error) {
    console.error('Failed to check Java:', error)
  }
}

// 获取应用版本
async function getAppVersion() {
  try {
    appVersion.value = await window.api.app.getVersion()
  } catch (error) {
    console.error('Failed to get app version:', error)
  }
}

// 处理菜单选择
function handleMenuSelect(index: string) {
  router.push(index)
}

// 监听托盘导航事件
function handleTrayNavigate(path: string) {
  router.push(path)
}

// 监听托盘快速启动事件
function handleTrayQuickStart(mode: string) {
  router.push({ path: '/startup', query: { quickStart: mode } })
}

onMounted(async () => {
  // 初始化主题
  themeStore.init()
  
  await Promise.all([checkJava(), getAppVersion()])

  // 注册托盘事件监听
  window.api.on('tray:navigate', handleTrayNavigate)
  window.api.on('tray:quick-start', handleTrayQuickStart)
})

onUnmounted(() => {
  window.api.off('tray:navigate', handleTrayNavigate)
  window.api.off('tray:quick-start', handleTrayQuickStart)
})
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  background: var(--bg-color-base, #f5f7fa);
  transition: background-color 0.3s;
}

.sidebar {
  width: 220px;
  background: var(--sidebar-bg, #fff);
  border-right: 1px solid var(--border-color-light, #e4e7ed);
  display: flex;
  flex-direction: column;
  transition: background-color 0.3s, border-color 0.3s;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color-light, #e4e7ed);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-primary, #409eff);
}

.logo .title {
  font-size: 16px;
  font-weight: 600;
}

.version-tag {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-secondary, #909399);
}

.sidebar-menu {
  flex: 1;
  border-right: none;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color-light, #e4e7ed);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.theme-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary, #909399);
  padding: 8px 12px;
  background: var(--bg-color, #f5f7fa);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  user-select: none;
}

.theme-switch:hover {
  color: var(--color-primary, #409eff);
  background: var(--bg-color-hover, #ecf5ff);
}

.java-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--status-error-text, #f56c6c);
  padding: 8px 12px;
  background: var(--status-error-bg, #fef0f0);
  border-radius: 4px;
  transition: all 0.3s;
}

.java-status.has-java {
  color: var(--status-success-text, #67c23a);
  background: var(--status-success-bg, #f0f9eb);
}

.main-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
  transition: padding 0.3s;
  scrollbar-width: none;
}

.main-content::-webkit-scrollbar {
  display: none;
}

/* Element Plus 菜单深色模式适配 */
:deep(.el-menu) {
  background: transparent !important;
  border: none !important;
}

:deep(.el-menu-item) {
  transition: all 0.3s;
}

:deep(.el-menu-item:hover) {
  background: var(--menu-hover-bg, #ecf5ff) !important;
}

:deep(.el-menu-item.is-active) {
  background: var(--menu-active-bg, #409eff) !important;
  color: #fff !important;
}
</style>

<!-- 全局暗黑模式样式 -->
<style>
/* 隐藏 html/body 级别滚动条 */
html, body {
  overflow: hidden;
  margin: 0;
  padding: 0;
}

/* 浅色模式变量 */
:root {
  --bg-color-base: #f5f7fa;
  --sidebar-bg: #ffffff;
  --border-color-light: #e4e7ed;
  --text-color-secondary: #909399;
  --color-primary: #409eff;
  --bg-color: #f5f7fa;
  --bg-color-hover: #ecf5ff;
  --menu-hover-bg: #f5f7fa;
  --menu-active-bg: #409eff;
  --status-error-text: #f56c6c;
  --status-error-bg: #fef0f0;
  --status-success-text: #67c23a;
  --status-success-bg: #f0f9eb;
}

/* 深色模式变量 */
.dark {
  --bg-color-base: #1a1a2e;
  --sidebar-bg: #16213e;
  --border-color-light: #2d3748;
  --text-color-secondary: #a0aec0;
  --color-primary: #60a5fa;
  --bg-color: #1a1a2e;
  --bg-color-hover: #2d3748;
  --menu-hover-bg: #2d3748;
  --menu-active-bg: rgba(96, 165, 250, 0.15);
  --status-error-text: #fc8181;
  --status-error-bg: #742a2a;
  --status-success-text: #68d391;
  --status-success-bg: #1c4532;
}

/* 深色模式下 Element Plus 组件样式 */
.dark {
  color-scheme: dark;
}

.dark body,
.dark #app {
  background-color: #1a1a2e;
  color: #e2e8f0;
}

.dark .el-card {
  background-color: #16213e;
  border-color: #2d3748;
}

.dark .el-table {
  background-color: #16213e;
  color: #e2e8f0;
}

.dark .el-table th.el-table__cell {
  background-color: #1a1a2e !important;
  color: #e2e8f0;
  border-color: #2d3748 !important;
}

.dark .el-table tr {
  background-color: #16213e;
}

.dark .el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell {
  background: #1a1a2e;
}

.dark .el-table td.el-table__cell,
.dark .el-table th.el-table__cell.is-leaf {
  border-color: #2d3748 !important;
}

.dark .el-table__body tr:hover > td.el-table__cell {
  background-color: #2d3748 !important;
}

.dark .el-dialog {
  background-color: #16213e;
  border-color: #2d3748;
}

.dark .el-dialog__title {
  color: #e2e8f0;
}

.dark .el-input__wrapper {
  background-color: #1a1a2e;
}

.dark .el-input__inner {
  color: #e2e8f0;
}

.dark .el-select-dropdown {
  background-color: #16213e;
  border-color: #2d3748;
}

.dark .el-select-dropdown__item {
  color: #e2e8f0;
}

.dark .el-select-dropdown__item.hover,
.dark .el-select-dropdown__item:hover {
  background-color: #2d3748;
}

.dark .el-popper.is-light {
  background-color: #16213e;
  border-color: #2d3748;
}

.dark .el-message-box {
  background-color: #16213e;
  border-color: #2d3748;
}

.dark .el-message-box__title {
  color: #e2e8f0;
}

.dark .el-form-item__label {
  color: #a0aec0;
}

.dark .el-tabs__item {
  color: #a0aec0;
}

.dark .el-tabs__item.is-active {
  color: #60a5fa;
}

.dark .el-tabs__active-bar {
  background-color: #60a5fa;
}

.dark .el-tag {
  border-color: #2d3748;
}

.dark .el-tag--info {
  background-color: #2d3748;
  color: #e2e8f0;
}

.dark .el-tag--success {
  background-color: #1c4532;
  color: #68d391;
  border-color: #276749;
}

.dark .el-tag--warning {
  background-color: #744210;
  color: #f6e05e;
  border-color: #975a16;
}

.dark .el-tag--danger {
  background-color: #742a2a;
  color: #fc8181;
  border-color: #9b2c2c;
}

.dark .el-button--primary {
  background-color: #60a5fa;
  border-color: #60a5fa;
}

.dark .el-button--primary:hover {
  background-color: #3b82f6;
  border-color: #3b82f6;
}

.dark .el-pagination {
  color: #a0aec0;
}

.dark .el-pagination button {
  background-color: #16213e;
  color: #a0aec0;
}

.dark .el-pager li {
  background-color: #16213e;
  color: #a0aec0;
}

.dark .el-pager li.is-active {
  background-color: #60a5fa;
  color: #fff;
}

.dark .el-empty__description {
  color: #a0aec0;
}

.dark .el-divider {
  border-color: #2d3748;
}

.dark .el-breadcrumb__inner {
  color: #a0aec0;
}

.dark .el-breadcrumb__inner.is-link:hover {
  color: #60a5fa;
}

.dark .el-textarea__inner {
  background-color: #1a1a2e;
  color: #e2e8f0;
}

.dark .el-dropdown-menu {
  background-color: #16213e;
  border-color: #2d3748;
}

.dark .el-dropdown-menu__item {
  color: #e2e8f0;
}

.dark .el-dropdown-menu__item:hover {
  background-color: #2d3748;
  color: #60a5fa;
}
</style>
