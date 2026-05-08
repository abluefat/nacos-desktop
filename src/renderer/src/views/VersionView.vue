<template>
  <div class="version-view">
    <div class="view-header">
      <h2>版本管理</h2>
      <div class="header-actions">
        <el-button @click="refreshVersions">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button @click="showSettingsDialog">
          <el-icon><Setting /></el-icon>
          设置
        </el-button>
        <el-button type="success" @click="showDownloadDialog">
          <el-icon><Download /></el-icon>
          下载版本
        </el-button>
        <el-button type="primary" @click="showAddDialog">
          <el-icon><Plus /></el-icon>
          添加本地版本
        </el-button>
      </div>
    </div>

    <!-- 本地版本列表 -->
    <el-card class="version-card">
      <template #header>
        <div class="card-header">
          <div class="card-header-left">
            <span>本地已安装版本</span>
            <span class="version-count">{{ localVersions.length }} 个</span>
          </div>
          <div class="card-header-right" v-if="selectedVersions.length > 0">
            <el-button size="small" type="danger" @click="handleBatchDelete">
              <el-icon><Delete /></el-icon>
              批量卸载 ({{ selectedVersions.length }})
            </el-button>
            <el-button size="small" @click="selectedVersions = []">取消选择</el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="localVersions.length === 0" description="暂无已安装的 Nacos 版本">
        <el-button type="primary" @click="showDownloadDialog">下载版本</el-button>
      </el-empty>

      <div v-else class="version-grid">
        <div
          v-for="v in localVersions"
          :key="v.id"
          class="version-item"
          :class="{ selected: selectedVersions.includes(v.id) }"
          @click="toggleSelectVersion(v.id)"
        >
          <div class="version-checkbox">
            <el-checkbox
              :model-value="selectedVersions.includes(v.id)"
              @click.stop
              @change="toggleSelectVersion(v.id)"
            />
          </div>
          <div class="version-info">
            <el-tag type="success" size="large">{{ v.version }}</el-tag>
            <div class="version-meta">
              <span>安装路径: {{ v.install_path }}</span>
              <span>安装时间: {{ formatDate(v.downloaded_at) }}</span>
            </div>
          </div>
          <div class="version-actions">
            <el-button size="small" type="danger" @click.stop="handleDeleteVersion(v)">
              <el-icon><Delete /></el-icon>
              卸载
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- GitHub Releases 列表 -->
    <el-card class="releases-card">
      <template #header>
        <div class="card-header">
          <span>GitHub 最新版本
            <span style="color: #f56c6c; font-size: 13px">* 国内用户请使用代理</span>
          </span>
          <span class="version-count">{{ releases.length }} 个</span>
          <el-button size="small" link type="primary" @click="loadReleases">
            <el-icon><Refresh /></el-icon>
            刷新列表
          </el-button>
        </div>
      </template>

      <el-empty v-if="releases.length === 0 && !loadingReleases" description="点击刷新获取最新版本">
        <el-button type="primary" @click="loadReleases">加载版本列表</el-button>
      </el-empty>

      <div v-else-if="loadingReleases" v-loading="true" style="padding: 40px;">
        正在加载版本列表...
      </div>

      <el-table v-else :data="releases" stripe style="width: 100%">
        <el-table-column prop="tag_name" label="版本" width="120">
          <template #default="{ row }">
            <el-tag>{{ row.tag_name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="published_at" label="发布日期" width="140">
          <template #default="{ row }">
            {{ formatDate(row.published_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="isVersionInstalled(row.tag_name)"
              size="small"
              type="success"
              disabled
            >
              已安装
            </el-button>
            <el-button
              v-else-if="downloadingVersion === row.tag_name"
              size="small"
              type="warning"
              @click="cancelDownload"
            >
              取消下载
            </el-button>
            <el-button
              v-else
              size="small"
              type="primary"
              @click="downloadVersion(row)"
            >
              下载
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 下载进度对话框 -->
    <el-dialog
      v-model="downloadDialogVisible"
      title="正在下载"
      width="450px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <div v-if="downloadingVersion" class="download-progress">
        <div class="progress-info">
          <span>正在下载 Nacos {{ downloadingVersion }}</span>
          <span>{{ downloadPercent }}%</span>
        </div>
        <el-progress :percentage="downloadPercent" :stroke-width="20" :color="downloadError ? '#f56c6c' : '#67c23a'" />
        <div class="progress-detail">
          {{ formatSize(downloadedSize) }} / {{ formatSize(totalSize) }}
        </div>
        <div v-if="downloadError" class="download-error">
          <el-icon color="#f56c6c"><CircleClose /></el-icon>
          <span>{{ downloadError }}</span>
        </div>
      </div>
      <div v-else-if="downloadComplete" class="download-success">
        <el-icon color="#67c23a" size="48"><CircleCheck /></el-icon>
        <p>下载完成！</p>
      </div>
      <div v-else-if="downloadError" class="download-error-state">
        <el-icon color="#f56c6c" size="48"><CircleClose /></el-icon>
        <p class="error-title">下载失败</p>
        <p class="error-message">{{ downloadError }}</p>
        <p class="error-hint">* 如网络不稳定，请使用代理或手动下载后添加本地版本</p>
      </div>
      <template #footer>
        <el-button v-if="downloadComplete" type="primary" @click="finishDownload">
          完成
        </el-button>
        <el-button v-if="downloadError" type="primary" @click="retryDownload">
          重试
        </el-button>
        <el-button v-if="downloadError" @click="downloadDialogVisible = false">
          关闭
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加本地版本对话框 -->
    <el-dialog v-model="addDialogVisible" title="添加本地 Nacos 版本" width="500px">
      <el-form :model="versionForm" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="版本号" prop="version">
          <el-input v-model="versionForm.version" placeholder="如: 2.3.2" />
        </el-form-item>
        <el-form-item label="安装路径" prop="install_path">
          <el-input v-model="versionForm.install_path" placeholder="选择 Nacos 解压目录">
            <template #append>
              <el-button @click="selectDirectory">选择</el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitVersion">确定</el-button>
      </template>
    </el-dialog>

    <!-- 设置对话框 -->
    <el-dialog v-model="settingsDialogVisible" title="版本管理设置" width="500px">
      <el-form label-width="140px">
        <el-form-item label="版本安装目录">
          <el-input v-model="settingsForm.versionsPath" placeholder="留空使用默认目录">
            <template #append>
              <el-button @click="selectVersionsPath">选择</el-button>
            </template>
          </el-input>
          <div class="form-tip">
            默认: {{ defaultSettings.defaultVersionsPath }}
          </div>
        </el-form-item>
        <el-form-item label="下载目录">
          <el-input v-model="settingsForm.downloadPath" placeholder="留空使用默认目录">
            <template #append>
              <el-button @click="selectDownloadPath">选择</el-button>
            </template>
          </el-input>
          <div class="form-tip">
            下载的压缩包会保存在此目录
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

interface LocalVersion {
  id: number
  version: string
  install_path: string
  downloaded_at?: string
}

interface Release {
  tag_name: string
  name: string
  published_at: string
  body?: string
  assets: {
    name: string
    size: number
    browser_download_url: string
  }[]
}

interface Settings {
  versionsPath: string
  downloadPath: string
  defaultVersionsPath: string
}

const localVersions = ref<LocalVersion[]>([])
const releases = ref<Release[]>([])
const loadingReleases = ref(false)
const addDialogVisible = ref(false)
const downloadDialogVisible = ref(false)
const settingsDialogVisible = ref(false)
const formRef = ref()

// 批量选择
const selectedVersions = ref<number[]>([])

const versionForm = ref({
  version: '',
  install_path: ''
})

const settingsForm = reactive({
  versionsPath: '',
  downloadPath: ''
})

const defaultSettings = reactive<Settings>({
  versionsPath: '',
  downloadPath: '',
  defaultVersionsPath: ''
})

const formRules = {
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  install_path: [{ required: true, message: '请选择安装路径', trigger: 'blur' }]
}

// 下载相关状态
const downloadingVersion = ref<string | null>(null)
const downloadPercent = ref(0)
const downloadedSize = ref(0)
const totalSize = ref(0)
const downloadComplete = ref(false)
const downloadError = ref<string | null>(null)
const pendingDownloadUrl = ref<string | null>(null)
const pendingDownloadVersion = ref<string | null>(null)

// 监听下载进度
function handleDownloadProgress(version: string, percent: number, downloaded: number, total: number) {
  downloadingVersion.value = version
  downloadPercent.value = percent
  downloadedSize.value = downloaded
  totalSize.value = total
}

// 加载本地版本
async function loadLocalVersions() {
  try {
    localVersions.value = await window.api.version.getLocal()
  } catch (error) {
    console.error('Failed to load versions:', error)
    ElMessage.error('加载版本列表失败')
  }
}

// 刷新版本
async function refreshVersions() {
  await Promise.all([loadLocalVersions(), loadReleases()])
  ElMessage.success('刷新成功')
}

// 加载 GitHub Releases
async function loadReleases() {
  loadingReleases.value = true
  try {
    releases.value = await window.api.version.getReleases()
  } catch (error: any) {
    ElMessage.error(error.message || '加载版本列表失败')
  } finally {
    loadingReleases.value = false
  }
}

// 加载设置
async function loadSettings() {
  try {
    const settings = await window.api.settings.get()
    Object.assign(settingsForm, {
      versionsPath: settings.versionsPath || '',
      downloadPath: settings.downloadPath || ''
    })
    Object.assign(defaultSettings, settings)
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

// 显示设置对话框
async function showSettingsDialog() {
  await loadSettings()
  settingsDialogVisible.value = true
}

// 选择版本安装目录
async function selectVersionsPath() {
  try {
    const path = await window.api.dialog.openDirectory()
    if (path) {
      settingsForm.versionsPath = path
    }
  } catch (error) {
    ElMessage.error('选择目录失败')
  }
}

// 选择下载目录
async function selectDownloadPath() {
  try {
    const path = await window.api.dialog.openDirectory()
    if (path) {
      settingsForm.downloadPath = path
    }
  } catch (error) {
    ElMessage.error('选择目录失败')
  }
}

// 保存设置
async function saveSettings() {
  try {
    if (settingsForm.versionsPath) {
      await window.api.settings.setVersionsPath(settingsForm.versionsPath)
    }
    if (settingsForm.downloadPath) {
      await window.api.settings.setDownloadPath(settingsForm.downloadPath)
    }
    ElMessage.success('设置已保存')
    settingsDialogVisible.value = false
    await loadSettings()
  } catch (error: any) {
    ElMessage.error(error.message || '保存设置失败')
  }
}

// 切换版本选中状态
function toggleSelectVersion(id: number) {
  const index = selectedVersions.value.indexOf(id)
  if (index === -1) {
    selectedVersions.value.push(id)
  } else {
    selectedVersions.value.splice(index, 1)
  }
}

// 批量删除版本
async function handleBatchDelete() {
  if (selectedVersions.value.length === 0) return

  try {
    await ElMessageBox.confirm(
      `确定要卸载选中的 ${selectedVersions.value.length} 个版本吗？`,
      '确认批量卸载',
      { type: 'warning' }
    )

    const results = await window.api.version.batchDelete(selectedVersions.value)
    const failed = results.filter(r => !r.success)

    if (failed.length === 0) {
      ElMessage.success(`成功卸载 ${results.length} 个版本`)
    } else {
      ElMessage.warning(`成功 ${results.length - failed.length} 个，失败 ${failed.length} 个`)
    }

    selectedVersions.value = []
    await loadLocalVersions()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('批量卸载失败')
    }
  }
}

// 显示下载对话框
function showDownloadDialog() {
  if (releases.value.length === 0) {
    loadReleases().then(() => {
      if (releases.value.length > 0) {
        downloadDialogVisible.value = true
      }
    })
  } else {
    downloadDialogVisible.value = true
  }
}

// 显示添加本地版本对话框
function showAddDialog() {
  versionForm.value = { version: '', install_path: '' }
  addDialogVisible.value = true
}

// 检查版本是否已安装
function isVersionInstalled(tagName: string): boolean {
  const version = tagName.replace(/^v/, '') // 去掉 v 前缀
  return localVersions.value.some(v => v.version === version)
}

// 下载版本
async function downloadVersion(release: Release) {
  // 找到 Windows zip 包的下载链接
  const windowsAsset = release.assets.find(a => a.name.endsWith('.zip'))
  const tarAsset = release.assets.find(a => a.name.endsWith('.tar.gz'))

  const downloadUrl = windowsAsset?.browser_download_url || tarAsset?.browser_download_url

  if (!downloadUrl) {
    ElMessage.error('未找到该版本的下载链接')
    return
  }

  const version = release.tag_name.replace(/^v/, '')
  pendingDownloadVersion.value = version
  pendingDownloadUrl.value = downloadUrl
  downloadPercent.value = 0
  downloadedSize.value = 0
  totalSize.value = windowsAsset?.size || tarAsset?.size || 0
  downloadComplete.value = false
  downloadError.value = null
  downloadingVersion.value = version
  downloadDialogVisible.value = true

  try {
    const result = await window.api.version.download(version, downloadUrl)
    if (result.success) {
      downloadComplete.value = true
      await loadLocalVersions()
      // 自动添加到数据库
      if (result.message !== '版本已安装') {
        await window.api.version.add({
          version,
          install_path: result.path,
          size: totalSize.value
        })
        await loadLocalVersions()
        ElMessage.success(`Nacos ${version} 下载并安装成功！`)
      } else {
        ElMessage.success(`Nacos ${version} 安装成功！`)
      }
    }
  } catch (error: any) {
    downloadError.value = error.message || '下载失败'
    downloadingVersion.value = null
  }
}

// 重试下载
async function retryDownload() {
  if (!pendingDownloadVersion.value || !pendingDownloadUrl.value) return

  downloadError.value = null
  downloadingVersion.value = pendingDownloadVersion.value
  downloadPercent.value = 0
  downloadedSize.value = 0
  downloadComplete.value = false

  try {
    const result = await window.api.version.download(pendingDownloadVersion.value, pendingDownloadUrl.value)
    if (result.success) {
      downloadComplete.value = true
      await loadLocalVersions()
      if (result.message !== '版本已安装') {
        await window.api.version.add({
          version: pendingDownloadVersion.value,
          install_path: result.path,
          size: totalSize.value
        })
        await loadLocalVersions()
        ElMessage.success(`Nacos ${pendingDownloadVersion.value} 下载并安装成功！`)
      } else {
        ElMessage.success(`Nacos ${pendingDownloadVersion.value} 安装成功！`)
      }
    }
  } catch (error: any) {
    downloadError.value = error.message || '下载失败'
    downloadingVersion.value = null
  }
}

// 取消下载
async function cancelDownload() {
  if (downloadingVersion.value) {
    await window.api.version.cancelDownload(downloadingVersion.value)
    downloadingVersion.value = null
    downloadDialogVisible.value = false
    ElMessage.info('下载已取消')
  }
}

// 完成下载
function finishDownload() {
  downloadDialogVisible.value = false
  downloadingVersion.value = null
  downloadComplete.value = false
}

// 选择目录
async function selectDirectory() {
  try {
    const path = await window.api.dialog.openDirectory()
    if (path) {
      const dirName = path.split(/[\\/]/).pop() || ''
      const versionMatch = dirName.match(/(\d+\.\d+\.\d+)/)
      if (versionMatch && !versionForm.value.version) {
        versionForm.value.version = versionMatch[1]
      }
      versionForm.value.install_path = path
    }
  } catch (error) {
    ElMessage.error('选择目录失败，请重试')
    console.error('selectDirectory error:', error)
  }
}

// 提交版本
async function submitVersion() {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    const data = { ...versionForm.value }
    await window.api.version.add(data)
    ElMessage.success('版本添加成功')
    addDialogVisible.value = false
    await loadLocalVersions()
  } catch (error: any) {
    if (error.message) {
      ElMessage.error(error.message)
    }
  }
}

// 删除版本
async function handleDeleteVersion(version: LocalVersion) {
  try {
    await ElMessageBox.confirm(
      `确定要卸载 Nacos ${version.version} 吗？`,
      '确认卸载',
      { type: 'warning' }
    )
    await window.api.version.delete(version.id)
    ElMessage.success('卸载成功')
    await loadLocalVersions()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('卸载失败')
    }
  }
}

// 格式化日期
function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(async () => {
  await loadLocalVersions()
  // 自动加载 GitHub Releases
  loadReleases()
  // 监听下载进度
  window.api.on('download:progress', handleDownloadProgress)
})

onUnmounted(() => {
  window.api.off('download:progress', handleDownloadProgress)
})
</script>

<style scoped>
.version-view {
  max-width: 1000px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.view-header h2 {
  margin: 0;
  font-size: 20px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.version-card,
.releases-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header-right {
  display: flex;
  gap: 8px;
}

.version-count {
  color: #909399;
  font-size: 12px;
}

.version-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  transition: background 0.3s;
  cursor: pointer;
  border: 2px solid transparent;
}

.version-item:hover {
  background: #ecf5ff;
}

.version-item.selected {
  background: #f0f9eb;
  border-color: #67c23a;
}

.version-checkbox {
  margin-right: 12px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.version-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #606266;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.download-progress {
  padding: 20px 0;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
}

.progress-detail {
  text-align: center;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.download-success {
  text-align: center;
  padding: 40px 0;
}

.download-success p {
  margin-top: 16px;
  font-size: 16px;
  color: #67c23a;
}

.download-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #f56c6c;
  font-size: 13px;
  margin-top: 10px;
}

.download-error-state {
  text-align: center;
  padding: 20px;
}

.download-error-state .error-title {
  font-size: 18px;
  font-weight: bold;
  color: #f56c6c;
  margin: 12px 0 6px;
}

.download-error-state .error-message {
  color: #909399;
  font-size: 14px;
}

.download-error-state .error-hint {
  color: #c0c4cc;
  font-size: 12px;
  margin-top: 12px;
}
</style>
