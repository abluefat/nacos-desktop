<template>
  <div class="startup-view">
    <!-- 头部 -->
    <div class="view-header">
      <h2>启动管理</h2>
      <div class="header-actions">
        <el-button @click="loadInstances">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="handleCreateInstance">
          <el-icon><Plus /></el-icon>
          创建实例
        </el-button>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-if="instances.length === 0" description="暂无 Nacos 实例">
      <el-button type="primary" @click="handleCreateInstance">创建第一个实例</el-button>
    </el-empty>

    <!-- 实例列表 -->
    <div v-else class="instance-grid">
      <el-card v-for="inst in instances" :key="inst.id" class="instance-card">
        <template #header>
          <div class="instance-header">
            <div class="instance-name">
              <el-icon><Box /></el-icon>
              <span>{{ inst.name }}</span>
            </div>
            <!-- 状态标签 -->
            <el-tag v-if="inst.status === 'running'" type="success" size="small" effect="dark">
              <el-icon class="is-loading"><CircleCheck /></el-icon>
              运行中
            </el-tag>
            <el-tag v-else-if="inst.status === 'starting'" type="warning" size="small" effect="dark">
              <el-icon class="is-loading"><Loading /></el-icon>
              启动中
            </el-tag>
            <el-tag v-else type="info" size="small" effect="plain">
              <el-icon><CircleClose /></el-icon>
              已停止
            </el-tag>
          </div>
        </template>

        <div class="instance-info">
          <div class="info-row">
            <span class="label">版本</span>
            <span class="value">{{ inst.version }}</span>
          </div>
          <div class="info-row">
            <span class="label">模式</span>
            <el-tag size="small" :type="inst.mode === 'cluster' ? 'warning' : 'primary'">
              {{ inst.mode === 'cluster' ? '集群' : '单机' }}
            </el-tag>
          </div>
          <div class="info-row">
            <span class="label">端口</span>
            <span class="value">{{ inst.port }}</span>
          </div>
          <div class="info-row">
            <span class="label">JVM</span>
            <span class="value">{{ inst.jvm_xms || '512m' }} / {{ inst.jvm_xmx || '1024m' }}</span>
          </div>
          <div v-if="inst.pid" class="info-row">
            <span class="label">PID</span>
            <span class="value pid">{{ inst.pid }}</span>
          </div>
        </div>

        <!-- 集群节点（仅集群模式） -->
        <div v-if="inst.mode === 'cluster'" class="cluster-section">
          <div class="section-title">集群节点</div>
          <div v-if="clusterStatusMap[inst.id]" class="cluster-nodes">
            <div
              v-for="node in clusterStatusMap[inst.id].nodes"
              :key="node.node"
              class="cluster-node"
              :class="{ healthy: node.healthy, unhealthy: !node.healthy }"
            >
              <el-icon v-if="node.healthy"><CircleCheck /></el-icon>
              <el-icon v-else><CircleClose /></el-icon>
              <span>{{ node.node }}</span>
            </div>
          </div>
          <el-button v-else size="small" :loading="clusterLoading[inst.id]" @click="loadClusterStatus(inst)">
            查看节点状态
          </el-button>
        </div>

        <template #footer>
          <div class="instance-actions">
            <template v-if="inst.status === 'running'">
              <el-button size="small" type="danger" @click="handleStopInstance(inst)">
                <el-icon><VideoPause /></el-icon>
                停止
              </el-button>
              <el-button size="small" @click="openConsole(inst)">
                <el-icon><Top /></el-icon>
                控制台
              </el-button>
            </template>
            <template v-else-if="inst.status === 'starting'">
              <el-tag type="warning" size="small">
                <el-icon class="is-loading"><Loading /></el-icon>
                启动中...
              </el-tag>
            </template>
            <template v-else>
              <el-button size="small" type="success" @click="handleStartInstance(inst)">
                <el-icon><VideoPlay /></el-icon>
                启动
              </el-button>
            </template>

            <el-button size="small" @click="openLogViewer(inst)">
              <el-icon><Document /></el-icon>
              日志
            </el-button>
            <el-button size="small" type="warning" @click="handleEditInstance(inst)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button size="small" type="danger" plain @click="handleDeleteInstance(inst)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </template>
      </el-card>
    </div>

    <!-- 创建/编辑实例对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑实例' : '创建实例'" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="instanceForm" :rules="formRules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="instanceForm.name" placeholder="例如：本地开发环境" />
        </el-form-item>
        <el-form-item label="版本" prop="version">
          <el-select v-model="instanceForm.version" placeholder="选择 Nacos 版本" style="width: 100%">
            <el-option v-for="v in localVersions" :key="v.id" :label="`${v.version} (${v.install_path})`" :value="v.version" />
          </el-select>
        </el-form-item>
        <el-form-item label="模式" prop="mode">
          <el-radio-group v-model="instanceForm.mode">
            <el-radio value="standalone">单机</el-radio>
            <el-radio value="cluster">集群</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="端口" prop="port">
          <el-input-number v-model="instanceForm.port" :min="1" :max="65535" style="width: 100%">
            <template #suffix>
              <span style="color: #999">默认 8848</span>
            </template>
          </el-input-number>
        </el-form-item>
        <el-form-item label="JVM 内存" prop="jvm_xms">
          <el-input v-model="instanceForm.jvm_xms" placeholder="最小堆内存，如 512m" style="width: 48%" />
          <span style="margin: 0 8px; color: #999">/</span>
          <el-input v-model="instanceForm.jvm_xmx" placeholder="最大堆内存，如 1024m" style="width: 48%" />
        </el-form-item>
        <el-form-item label="工作目录" prop="work_dir">
          <el-input v-model="instanceForm.work_dir" placeholder="可选，留空则使用默认" />
        </el-form-item>
        <el-form-item v-if="instanceForm.mode === 'cluster'" label="集群节点" prop="cluster_nodes">
          <el-input
            v-model="clusterNodesInput"
            type="textarea"
            :rows="3"
            placeholder="每行一个节点，格式：192.168.1.1:8848"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="formLoading" @click="submitInstance">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 日志查看器抽屉 -->
    <el-drawer v-model="logDrawerVisible" :title="`日志 - ${currentLogInstance?.name}`" direction="rtl" size="55%" destroy-on-close>
      <!-- 标签页：启动日志 / 文件日志 -->
      <el-tabs v-model="logTab" class="log-tabs">
        <el-tab-pane label="启动日志" name="startup">
          <div class="log-toolbar">
            <el-button size="small" @click="clearStartupLogs">
              <el-icon><Delete /></el-icon>
              清空
            </el-button>
            <el-button size="small" :icon="Bottom" @click="scrollToBottom">滚动到底部</el-button>
          </div>
          <div ref="logContainer" class="log-content startup-log">
            <div v-if="startupLogs.length === 0" class="log-empty">暂无日志，等待启动...</div>
            <div v-for="(log, i) in startupLogs" :key="i" class="log-line" :class="getLogClass(log)">{{ log }}</div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="文件日志" name="files">
          <div v-if="logFiles.length === 0" class="log-empty">
            <el-button size="small" :loading="logFilesLoading" @click="loadLogFiles">刷新文件列表</el-button>
          </div>
          <div v-else class="log-files">
            <el-scrollbar height="100%">
              <div v-for="file in logFiles" :key="file.name" class="log-file-item">
                <el-icon><Document /></el-icon>
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">{{ formatSize(file.size) }}</span>
                <el-button size="small" @click="loadLogFile(file.name)">查看</el-button>
              </div>
            </el-scrollbar>
          </div>
          <!-- 文件内容 -->
          <div v-if="currentLogFile" class="log-file-content">
            <div class="file-content-header">
              <span>{{ currentLogFile }}</span>
              <el-button size="small" @click="currentLogFile = null">关闭</el-button>
            </div>
            <el-scrollbar height="100%">
              <pre class="file-pre">{{ logFileContent }}</pre>
            </el-scrollbar>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <!-- 启动结果提示 -->
    <el-dialog v-model="startResultVisible" :title="startResult.success ? '启动成功' : '启动失败'" width="420px" center>
      <div v-if="startResult.success" style="text-align: center">
        <el-icon size="48" color="#67c23a"><CircleCheck /></el-icon>
        <p style="margin-top: 16px">{{ startResult.message }}</p>
        <p v-if="startResult.pid" style="color: #999; font-size: 12px">PID: {{ startResult.pid }}</p>
      </div>
      <div v-else style="text-align: center">
        <el-icon size="48" color="#f56c6c"><CircleClose /></el-icon>
        <p style="margin-top: 16px">{{ startResult.message }}</p>
      </div>
      <template #footer>
        <el-button @click="startResultVisible = false">关闭</el-button>
        <el-button v-if="!startResult.success" type="primary" @click="startResultVisible = false; openLogViewer(currentLogInstance)">
          查看日志
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Box, VideoPlay, VideoPause, Top, Edit, Delete, CircleCheck, CircleClose, Document, Bottom, Loading } from '@element-plus/icons-vue'

interface LocalVersion { id: number; version: string; install_path: string }
interface Instance { id: number; name: string; version: string; mode: string; port: number; pid: number | null; status: string; jvm_xms: string; jvm_xmx: string; cluster_nodes: string | null }

// 状态
const instances = ref<Instance[]>([])
const localVersions = ref<LocalVersion[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const formLoading = ref(false)
const logDrawerVisible = ref(false)
const currentLogInstance = ref<Instance | null>(null)
const startupLogs = ref<string[]>([])
const logContainer = ref<HTMLElement | null>(null)
const logTab = ref('startup')
const logFiles = ref<any[]>([])
const logFilesLoading = ref(false)
const currentLogFile = ref<string | null>(null)
const logFileContent = ref('')
const clusterStatusMap = ref<Record<number, any>>({})
const clusterLoading = ref<Record<number, boolean>>({})
const startResultVisible = ref(false)
const startResult = ref<{ success: boolean; message: string; pid?: number }>({})

const instanceForm = reactive({
  name: '',
  version: '',
  mode: 'standalone',
  port: 8848,
  jvm_xms: '512m',
  jvm_xmx: '1024m',
  work_dir: '',
  cluster_nodes: ''
})
const clusterNodesInput = ref('')

const formRules = {
  name: [{ required: true, message: '请输入实例名称', trigger: 'blur' }],
  version: [{ required: true, message: '请选择版本', trigger: 'change' }],
  port: [{ required: true, message: '请输入端口', trigger: 'blur' }]
}

// 加载实例列表
async function loadInstances() {
  instances.value = await window.api.instance.getAll()
}

// 加载本地版本
async function loadLocalVersions() {
  localVersions.value = await window.api.version.getLocal()
}

// 加载集群状态
async function loadClusterStatus(inst: Instance) {
  clusterLoading.value[inst.id] = true
  try {
    const status = await window.api.instance.clusterStatus(inst.id)
    clusterStatusMap.value[inst.id] = status
  } catch (e: any) {
    ElMessage.error(`获取集群状态失败: ${e.message}`)
  } finally {
    clusterLoading.value[inst.id] = false
  }
}

// 创建实例
function handleCreateInstance() {
  isEdit.value = false
  editingId.value = null
  Object.assign(instanceForm, { name: '', version: '', mode: 'standalone', port: 8848, jvm_xms: '512m', jvm_xmx: '1024m', work_dir: '', cluster_nodes: '' })
  clusterNodesInput.value = ''
  dialogVisible.value = true
}

// 编辑实例
function handleEditInstance(inst: Instance) {
  isEdit.value = true
  editingId.value = inst.id
  Object.assign(instanceForm, {
    name: inst.name,
    version: inst.version,
    mode: inst.mode,
    port: inst.port,
    jvm_xms: inst.jvm_xms || '512m',
    jvm_xmx: inst.jvm_xmx || '1024m',
    work_dir: inst.work_dir || ''
  })
  try {
    clusterNodesInput.value = inst.cluster_nodes ? JSON.parse(inst.cluster_nodes).join('\n') : ''
  } catch { clusterNodesInput.value = '' }
  dialogVisible.value = true
}

// 提交实例
async function submitInstance() {
  if (!formRef.value) return
  try { await formRef.value.validate() } catch { return }

  formLoading.value = true
  try {
    const data: any = { ...instanceForm }
    if (instanceForm.mode === 'cluster' && clusterNodesInput.value) {
      data.cluster_nodes = JSON.stringify(clusterNodesInput.value.split('\n').map(l => l.trim()).filter(Boolean))
    }
    if (isEdit.value && editingId.value) {
      await window.api.instance.update(editingId.value, data)
      ElMessage.success('实例已更新')
    } else {
      await window.api.instance.create(data)
      ElMessage.success('实例创建成功')
    }
    dialogVisible.value = false
    await loadInstances()
  } catch (e: any) {
    ElMessage.error(e.message)
  } finally {
    formLoading.value = false
  }
}

// 启动实例
async function handleStartInstance(inst: Instance) {
  try {
    const result = await window.api.instance.start(inst.id)
    startResult.value = result
    startResultVisible.value = true
    if (result.success) {
      await loadInstances()
    }
  } catch (e: any) {
    startResult.value = { success: false, message: e.message }
    startResultVisible.value = true
  }
}

// 停止实例
async function handleStopInstance(inst: Instance) {
  try {
    await ElMessageBox.confirm(`确定要停止实例「${inst.name}」吗？`, '停止确认', { type: 'warning' })
    await window.api.instance.stop(inst.id)
    ElMessage.success('已停止')
    await loadInstances()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

// 删除实例
async function handleDeleteInstance(inst: Instance) {
  try {
    await ElMessageBox.confirm(`确定要删除实例「${inst.name}」吗？此操作不会删除 Nacos 安装目录。`, '删除确认', { type: 'warning' })
    await window.api.instance.delete(inst.id)
    ElMessage.success('已删除')
    await loadInstances()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

// 打开控制台
function openConsole(inst: Instance) {
  const url = `http://127.0.0.1:${inst.port}/nacos`
  window.api.shell.openExternal(url)
}

// 日志查看器
function openLogViewer(inst: Instance) {
  currentLogInstance.value = inst
  startupLogs.value = []
  logTab.value = 'startup'
  logDrawerVisible.value = true
}

// 加载日志文件列表
async function loadLogFiles() {
  if (!currentLogInstance.value) return
  logFilesLoading.value = true
  try {
    logFiles.value = await window.api.instance.logFiles(currentLogInstance.value.id)
  } catch (e: any) {
    ElMessage.error(e.message)
  } finally {
    logFilesLoading.value = false
  }
}

// 加载日志文件内容
async function loadLogFile(fileName: string) {
  if (!currentLogInstance.value) return
  try {
    const result = await window.api.instance.logContent(currentLogInstance.value.id, fileName)
    currentLogFile.value = fileName
    logFileContent.value = result.content
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}

// 清空启动日志
function clearStartupLogs() {
  startupLogs.value = []
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

// 日志行分类着色
function getLogClass(line: string): string {
  if (line.includes('ERROR') || line.includes('Exception') || line.includes('FAILED')) return 'log-error'
  if (line.includes('WARN')) return 'log-warn'
  if (line.includes('Nacos started successfully') || line.includes('Server startup')) return 'log-success'
  if (line.includes('INFO')) return 'log-info'
  return ''
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// 事件处理
function onInstanceLog(instanceId: number, log: string) {
  if (currentLogInstance.value?.id === instanceId) {
    startupLogs.value.push(...log.split('\n').filter(Boolean))
    // 最多保留 2000 行
    if (startupLogs.value.length > 2000) {
      startupLogs.value = startupLogs.value.slice(-1500)
    }
    scrollToBottom()
  }
}

function onInstanceStatusChanged(instanceId: number, status: string) {
  const inst = instances.value.find(i => i.id === instanceId)
  if (inst) {
    inst.status = status
    inst.pid = status === 'running' ? inst.pid : null
  }
}

// 生命周期
onMounted(async () => {
  await loadInstances()
  await loadLocalVersions()

  // 监听日志
  window.api.on('instance:log', onInstanceLog)
  window.api.on('instance:status-changed', onInstanceStatusChanged)

  // 加载日志文件（当切换到文件日志 tab 时）
  logTab.value = 'startup'
})

onUnmounted(() => {
  // 移除监听
})

// 监听标签页切换
import { watch } from 'vue'
watch(logTab, (val) => {
  if (val === 'files' && logFiles.value.length === 0) {
    loadLogFiles()
  }
})
</script>

<style scoped>
.startup-view {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.view-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.instance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
  flex: 1;
}

.instance-card {
  transition: box-shadow 0.2s;
}

.instance-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.instance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.instance-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.instance-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-row .label {
  color: #999;
  font-size: 13px;
  min-width: 42px;
}

.info-row .value {
  font-size: 13px;
  color: #333;
}

.info-row .pid {
  font-family: 'Consolas', monospace;
  color: #666;
  font-size: 12px;
}

.cluster-section {
  border-top: 1px solid #eee;
  padding-top: 10px;
  margin-top: 4px;
}

.section-title {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.cluster-nodes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cluster-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
}

.cluster-node.healthy {
  color: #67c23a;
  background: #f0f9eb;
}

.cluster-node.unhealthy {
  color: #f56c6c;
  background: #fef0f0;
}

.instance-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* 日志查看器 */
.log-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.log-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.startup-log {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  padding: 12px;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-empty {
  text-align: center;
  color: #666;
  padding: 40px;
}

.log-line.log-error { color: #f56c6c; }
.log-line.log-warn { color: #e6a23c; }
.log-line.log-success { color: #67c23a; font-weight: bold; }
.log-line.log-info { color: #909399; }

.log-files {
  max-height: 200px;
  margin-bottom: 16px;
}

.log-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.log-file-item .file-name {
  flex: 1;
  font-size: 13px;
}

.log-file-item .file-size {
  color: #999;
  font-size: 12px;
}

.log-file-content {
  border: 1px solid #eee;
  border-radius: 6px;
  overflow: hidden;
}

.file-content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fa;
  font-size: 13px;
  color: #666;
}

.file-pre {
  margin: 0;
  padding: 12px;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: 400px;
  overflow: auto;
  background: #fafafa;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
