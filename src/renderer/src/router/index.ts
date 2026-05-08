import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/version'
  },
  {
    path: '/version',
    name: 'Version',
    component: () => import('@/views/VersionView.vue')
  },
  {
    path: '/startup',
    name: 'Startup',
    component: () => import('@/views/StartupView.vue')
  },
  {
    path: '/config',
    name: 'Config',
    component: () => import('@/views/ConfigView.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
