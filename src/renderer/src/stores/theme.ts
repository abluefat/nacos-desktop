import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { electron } from '@electron-toolkit/preload'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  // 主题模式：light, dark, system
  const themeMode = ref<ThemeMode>(
    (localStorage.getItem('theme-mode') as ThemeMode) || 'system'
  )

  // 实际应用的主题（根据 system 模式计算）
  const effectiveTheme = ref<'light' | 'dark'>('light')

  // 初始化
  function init() {
    // 计算实际主题
    updateEffectiveTheme()
    
    // 监听系统主题变化
    if (window.api?.system?.onThemeChange) {
      window.api.system.onThemeChange((isDark: boolean) => {
        if (themeMode.value === 'system') {
          effectiveTheme.value = isDark ? 'dark' : 'light'
          applyTheme()
        }
      })
    }
    
    // 应用初始主题
    applyTheme()
  }

  // 更新实际主题
  function updateEffectiveTheme() {
    if (themeMode.value === 'system') {
      // 获取系统主题
      const preferDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      effectiveTheme.value = preferDark ? 'dark' : 'light'
    } else {
      effectiveTheme.value = themeMode.value as 'light' | 'dark'
    }
  }

  // 应用主题到 DOM
  function applyTheme() {
    const html = document.documentElement
    
    // 设置 data-theme 属性
    html.setAttribute('data-theme', effectiveTheme.value)
    
    // 设置 Element Plus 暗黑模式 class
    if (effectiveTheme.value === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }

  // 设置主题模式
  function setTheme(mode: ThemeMode) {
    themeMode.value = mode
    localStorage.setItem('theme-mode', mode)
    
    updateEffectiveTheme()
    applyTheme()
  }

  // 切换主题（循环切换：light -> dark -> system -> light）
  function toggleTheme() {
    const modes: ThemeMode[] = ['light', 'dark', 'system']
    const currentIndex = modes.indexOf(themeMode.value)
    const nextIndex = (currentIndex + 1) % modes.length
    setTheme(modes[nextIndex])
  }

  return {
    themeMode,
    effectiveTheme,
    init,
    setTheme,
    toggleTheme
  }
})
