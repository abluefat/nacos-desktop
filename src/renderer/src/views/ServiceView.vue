<template>
  <div class="service-view">
    <!-- 左侧：连接列表 -->
    <div class="left-panel">
      <div class="panel-header">
        <span class="panel-title">连接</span>
      </div>

      <el-empty v-if="connections.length === 0" description="暂无连接" :image-size="60" />

      <div class="connection-list">
        <div
          v-for="conn in connections"
          :key="conn.id"
          class="connection-item"
          :class="{ active: activeConnection?.id === conn.id }"
          @click="selectConnection(conn)"
        >
          <div class="conn-status-dot" :class="getConnStatusClass(conn)" />
          <div class="conn-info">
            <div class="conn-name">
              {{ conn.name }}
              <el-tag v-if="conn.instance_id" size="small" type="info">本地</el-tag>
              <el-tag v-else-if="conn.version === '3.x'" size="small" type="warning">3.x</el-tag>
            </div>
            <div class="conn-url">{{ conn.server_url }}</div>
          </div>
        </div>
      </div>

      <div class="refresh-btn">
        <el-button size="small" text @click="loadConnections">
          <el-icon><Refresh /></el-icon>刷新连接
        </el-button>
      </div>
    </div>

    <!-- 右侧：主内容区 -->
    <div class="right-panel">
      <el-empty v-if="!activeConnection" description="请选择左侧连接以查看服务" :image-size="80" />

      <template v-else>
        <!-- 顶部工具栏 -->
        <div class="toolbar">
          <div class="toolbar-left">
            <span class="active-conn-name">{{ activeConnection.name }}</span>
            <el-tag v-if="loginStatus === 'success'" type="success" size="small">
              <el-icon style="vertical-align: middle"><CircleCheck /></el-icon> 已认证
            </el-tag>
          </div>
          <div class="toolbar-right">
            <!-- 命名空间 -->
            <el-select
              v-model="selectedNamespace"
              placeholder="命名空间"
              size="small"
              style="width: 180px"
              filterable
              @change="() => { pageNo = 1; loadServices() }"
            >
              <el-option label="public (默认)" value="" />
              <el-option
                v-for="ns in namespaces"
                :key="ns.namespace"
                :label="`${ns.namespaceShowName} (${ns.namespace})`"
                :value="ns.namespace"
              />
            </el-select>
            <!-- 分组筛选 -->
            <el-input
              v-model="searchGroup"
              placeholder="Group"
              size="small"
              clearable
              style="width: 140px"
            />
            <!-- 服务名筛选 -->
            <el-input
              v-model="searchServiceName"
              placeholder="服务名"
              size="small"
              clearable
              style="width: 160px"
              @keyup.enter="() => { pageNo = 1; loadServices() }"
            />
            <el-button size="small" type="primary" :icon="Search" @click="() => { pageNo = 1; loadServices() }">搜索</el-button>
            <el-button size="small" :icon="Refresh" @click="() => { pageNo = 1; loadServices() }">刷新</el-button>
          </div>
        </div>

        <!-- 服务列表 -->
        <el-table
          :data="services"
          stripe
          v-loading="tableLoading"
          style="width: 100%"
          height="calc(100vh - 260px)"
          @row-click="handleServiceClick"
          row-class-name="service-row"
        >
          <el-table-column prop="name" label="服务名" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="service-name-link">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="groupName" label="分组" width="150" />
          <el-table-column prop="clusterCount" label="集群数" width="80" align="center" />
          <el-table-column prop="ipCount" label="实例数" width="80" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.ipCount > 0 ? 'success' : 'danger'">{{ row.ipCount }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="healthyInstanceCount" label="健康实例" width="90" align="center">
            <template #default="{ row }">
              <el-tag size="small" type="success">{{ row.healthyInstanceCount ?? '-' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="保护阈值" width="100" align="center">
            <template #default="{ row }">
              {{ row.protectThreshold != null ? (row.protectThreshold * 100).toFixed(0) + '%' : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" plain @click.stop="openInstanceDialog(row)">
                <el-icon><List /></el-icon>实例
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination">
          <el-pagination
            v-model:current-page="pageNo"
            v-model:page-size="pageSize"
            :total="totalCount"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            small
            @current-change="loadServices"
            @size-change="loadServices"
          />
        </div>
      </template>
    </div>

    <!-- ========== 实例列表对话框 ========== -->
    <el-dialog
      v-model="instanceDialogVisible"
      :title="`服务实例: ${currentService?.name}`"
      width="900px"
      destroy-on-close
    >
      <div class="instance-toolbar">
        <el-tag size="small" type="info">{{ currentService?.groupName }}</el-tag>
        <el-tag size="small">{{ selectedNamespace || 'public' }}</el-tag>
        <!-- 集群筛选 -->
        <el-select
          v-if="clusters.length > 0"
          v-model="selectedCluster"
          placeholder="所有集群"
          size="small"
          clearable
          style="width: 140px"
          @change="loadInstances"
        >
          <el-option v-for="c in clusters" :key="c" :label="c" :value="c" />
        </el-select>
        <el-button size="small" :icon="Refresh" @click="loadInstances">刷新</el-button>
        <span class="instance-count">
          共 <strong>{{ instances.length }}</strong> 个实例，
          <strong class="healthy">{{ instances.filter(i => i.healthy).length }}</strong> 个健康
        </span>
      </div>

      <el-table
        :data="instances"
        stripe
        v-loading="instanceLoading"
        style="width: 100%"
        max-height="420px"
      >
        <el-table-column prop="ip" label="IP" width="150" />
        <el-table-column prop="port" label="端口" width="90" align="center" />
        <el-table-column prop="clusterName" label="集群" width="110" />
        <el-table-column label="健康" width="80" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.healthy" color="#67c23a" :size="16"><CircleCheck /></el-icon>
            <el-icon v-else color="#f56c6c" :size="16"><CircleClose /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.enabled ? 'success' : 'danger'">
              {{ row.enabled ? '上线' : '下线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="70" align="center" />
        <el-table-column label="元数据" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="metadata-text">{{ formatMetadata(row.metadata) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              :type="row.enabled ? 'danger' : 'success'"
              plain
              @click="toggleInstance(row)"
              :loading="row._toggling"
            >
              {{ row.enabled ? '下线' : '上线' }}
            </el-button>
            <el-button size="small" @click="openWeightDialog(row)">权重</el-button>
            <el-button size="small" type="info" plain @click="showInstanceDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="instanceDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- ========== 权重修改对话框 ========== -->
    <el-dialog v-model="weightDialogVisible" title="修改实例权重" width="360px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="实例">
          <span>{{ weightTarget?.ip }}:{{ weightTarget?.port }}</span>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="weightValue" :min="0" :max="100" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="weightDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitWeight" :loading="weightLoading">确定</el-button>
      </template>
    </el-dialog>

    <!-- ========== 实例详情对话框 ========== -->
    <el-dialog v-model="detailDialogVisible" title="实例详情" width="480px" destroy-on-close>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="IP">{{ detailInstance?.ip }}</el-descriptions-item>
        <el-descriptions-item label="端口">{{ detailInstance?.port }}</el-descriptions-item>
        <el-descriptions-item label="服务名">{{ currentService?.name }}</el-descriptions-item>
        <el-descriptions-item label="集群">{{ detailInstance?.clusterName }}</el-descriptions-item>
        <el-descriptions-item label="健康">
          <el-tag size="small" :type="detailInstance?.healthy ? 'success' : 'danger'">
            {{ detailInstance?.healthy ? '健康' : '不健康' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small" :type="detailInstance?.enabled ? 'success' : 'danger'">
            {{ detailInstance?.enabled ? '上线' : '下线' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="权重">{{ detailInstance?.weight }}</el-descriptions-item>
        <el-descriptions-item label="短暂实例">{{ detailInstance?.ephemeral ? '是' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="元数据" :span="2">
          <pre class="metadata-detail">{{ formatMetadataFull(detailInstance?.metadata) }}</pre>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search, List, CircleCheck, CircleClose } from '@element-plus/icons-vue'

// ==================== IPC 请求封装（与 ConfigView 保持一致）====================
async function nacosRequest(options: {
  method?: string; url: string; params?: Record<string, any>; body?: string; headers?: Record<string, string>
}): Promise<any> {
  const result = await window.api.nacos.request(options)
  if (result.status >= 400) {
    const msg = typeof result.data === 'object'
      ? (result.data?.message || result.data?.msg || result.data?.errMsg || JSON.stringify(result.data))
      : String(result.data)
    throw new Error(msg || `HTTP ${result.status}`)
  }
  return result.data
}

async function nacosGet(url: string, params?: Record<string, any>): Promise<any> {
  return nacosRequest({ method: 'GET', url, params })
}

async function nacosPut(url: string, params?: Record<string, any>): Promise<any> {
  const queryStr = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : ''
  const fullUrl = queryStr ? `${url}?${queryStr}` : url
  return nacosRequest({ method: 'PUT', url: fullUrl })
}

async function nacosPost(url: string, formData: Record<string, string>): Promise<any> {
  const body = Object.entries(formData)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return nacosRequest({ method: 'POST', url, body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
}

// ==================== 类型定义 ====================
interface NacosConnection {
  id?: number; name: string; server_url: string; version?: string; username?: string; password?: string; instance_id?: number
}
interface NacosNamespace {
  namespace: string; namespaceShowName: string
}
interface NacosService {
  name: string; groupName: string; clusterCount: number; ipCount: number; healthyInstanceCount?: number; protectThreshold?: number
}
interface NacosInstance {
  ip: string; port: number; clusterName: string; healthy: boolean; enabled: boolean; weight: number
  ephemeral?: boolean; metadata?: Record<string, string>; _toggling?: boolean
}

// ==================== 状态 ====================
const connections = ref<NacosConnection[]>([])
const activeConnection = ref<NacosConnection | null>(null)
const accessToken = ref('')
const loginStatus = ref<'none' | 'success' | 'fail'>('none')
const connStatusMap = ref<Record<number, 'success' | 'fail' | 'none'>>({})

const namespaces = ref<NacosNamespace[]>([])
const selectedNamespace = ref('')

const services = ref<NacosService[]>([])
const tableLoading = ref(false)
const searchGroup = ref('')
const searchServiceName = ref('')
const pageNo = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)

// 实例对话框
const instanceDialogVisible = ref(false)
const currentService = ref<NacosService | null>(null)
const instances = ref<NacosInstance[]>([])
const instanceLoading = ref(false)
const clusters = ref<string[]>([])
const selectedCluster = ref('')

// 权重对话框
const weightDialogVisible = ref(false)
const weightTarget = ref<NacosInstance | null>(null)
const weightValue = ref(1)
const weightLoading = ref(false)

// 详情对话框
const detailDialogVisible = ref(false)
const detailInstance = ref<NacosInstance | null>(null)

// ==================== 工具函数 ====================
function getBaseURL(): string {
  if (!activeConnection.value) return ''
  return activeConnection.value.server_url.replace(/\/$/, '') + '/nacos'
}

function isV3(): boolean {
  return activeConnection.value?.version === '3.x'
}

function unwrapResponse(res: any): any {
  if (!isV3()) return res
  if (res && typeof res === 'object' && 'data' in res && 'code' in res) return res.data
  return res
}

function getConnStatusClass(conn: NacosConnection): string {
  const s = connStatusMap.value[conn.id ?? 0]
  if (s === 'success') return 'dot-green'
  if (s === 'fail') return 'dot-red'
  return 'dot-gray'
}

function formatMetadata(meta?: Record<string, string>): string {
  if (!meta || Object.keys(meta).length === 0) return '-'
  return Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' | ')
}

function formatMetadataFull(meta?: Record<string, string>): string {
  if (!meta || Object.keys(meta).length === 0) return '（无）'
  return JSON.stringify(meta, null, 2)
}

// ==================== 连接管理 ====================
async function loadConnections() {
  connections.value = await window.api.connection.getAll()
  for (const conn of connections.value) {
    if (conn.id !== undefined) {
      try {
        const r = await window.api.connection.healthCheck(conn.server_url, conn.version)
        connStatusMap.value[conn.id] = r.reachable ? 'success' : 'fail'
      } catch {
        connStatusMap.value[conn.id] = 'fail'
      }
    }
  }
}

async function selectConnection(conn: NacosConnection) {
  if (activeConnection.value?.id === conn.id) return
  activeConnection.value = conn
  accessToken.value = ''
  loginStatus.value = 'none'
  namespaces.value = []
  selectedNamespace.value = ''
  services.value = []
  pageNo.value = 1

  // 自动登录
  if (conn.username) await doLogin(conn)
  await loadNamespaces()
  await loadServices()
}

// ==================== 登录 ====================
async function doLogin(conn: NacosConnection) {
  if (!conn.username) return
  try {
    const baseURL = getBaseURL()
    const res = await nacosPost(`${baseURL}/v1/auth/users/login`, {
      username: conn.username || '', password: conn.password || ''
    })
    if (res?.accessToken) {
      accessToken.value = res.accessToken
      loginStatus.value = 'success'
    }
  } catch (e: any) {
    // 登录失败不中断，后续 API 请求遇到 403 再提示
    console.warn('[ServiceView] login failed:', e?.message)
  }
}

// ==================== 命名空间 ====================
async function loadNamespaces() {
  try {
    const path = isV3() ? '/v3/admin/core/namespace/list' : '/v1/console/namespaces'
    const params: Record<string, any> = {}
    if (accessToken.value) params.accessToken = accessToken.value
    const res = await nacosGet(`${getBaseURL()}${path}`, params)
    const data = unwrapResponse(res)
    const list = data?.data || data
    if (Array.isArray(list)) {
      namespaces.value = (list as NacosNamespace[]).filter(n => n.namespace !== '')
    }
  } catch (e: any) {
    console.warn('[ServiceView] loadNamespaces error:', e?.message)
  }
}

// ==================== 服务列表 ====================
async function loadServices() {
  if (!activeConnection.value) return
  tableLoading.value = true
  try {
    const params: Record<string, any> = { pageNo: pageNo.value, pageSize: pageSize.value }
    if (selectedNamespace.value) params.namespaceId = selectedNamespace.value
    if (searchGroup.value) params.groupName = searchGroup.value
    if (searchServiceName.value) params.serviceName = searchServiceName.value
    if (accessToken.value) params.accessToken = accessToken.value

    let url: string
    if (isV3()) {
      url = `${getBaseURL()}/v3/admin/ns/service/list`
    } else {
      url = `${getBaseURL()}/v1/ns/catalog/services`
      // 1.x/2.x catalog API 还需要 hasIpCount=true
      params.hasIpCount = true
    }

    const res = await nacosGet(url, params)
    const data = unwrapResponse(res)

    // 3.x: {count, serviceList:[{name,groupName,...}]}
    // 2.x: {count, serviceList:[{name,groupName,...}]}
    if (data?.serviceList !== undefined) {
      services.value = (data.serviceList as any[]).map(normalizeService)
      totalCount.value = data.count || 0
    } else {
      services.value = []
      totalCount.value = 0
    }
  } catch (e: any) {
    ElMessage.error(`加载服务失败: ${e.message}`)
  } finally {
    tableLoading.value = false
  }
}

function normalizeService(item: any): NacosService {
  return {
    name: item.name || item.serviceName || '',
    groupName: item.groupName || 'DEFAULT_GROUP',
    clusterCount: item.clusterCount ?? 0,
    ipCount: item.ipCount ?? item.instanceCount ?? 0,
    healthyInstanceCount: item.healthyInstanceCount,
    protectThreshold: item.protectThreshold
  }
}

// ==================== 实例列表 ====================
async function openInstanceDialog(svc: NacosService) {
  currentService.value = svc
  selectedCluster.value = ''
  clusters.value = []
  instanceDialogVisible.value = true
  await loadInstances()
}

async function handleServiceClick(row: NacosService) {
  openInstanceDialog(row)
}

async function loadInstances() {
  if (!currentService.value || !activeConnection.value) return
  instanceLoading.value = true
  try {
    const svc = currentService.value
    let res: any
    if (isV3()) {
      const params: Record<string, any> = {
        serviceName: svc.name,
        groupName: svc.groupName
      }
      if (selectedNamespace.value) params.namespaceId = selectedNamespace.value
      if (selectedCluster.value) params.clusterName = selectedCluster.value
      if (accessToken.value) params.accessToken = accessToken.value
      res = await nacosGet(`${getBaseURL()}/v3/admin/ns/instance/list`, params)
      const data = unwrapResponse(res)
      // 3.x 返回 {count, instanceList:[...]}
      const list = data?.instanceList || data?.list || []
      instances.value = list.map(normalizeInstance)
    } else {
      const params: Record<string, any> = {
        serviceName: svc.groupName !== 'DEFAULT_GROUP' ? `${svc.groupName}@@${svc.name}` : svc.name,
        healthyOnly: false
      }
      if (selectedNamespace.value) params.namespaceId = selectedNamespace.value
      if (selectedCluster.value) params.clusters = selectedCluster.value
      if (accessToken.value) params.accessToken = accessToken.value
      res = await nacosGet(`${getBaseURL()}/v1/ns/instance/list`, params)
      const data = res
      const list = data?.hosts || []
      instances.value = list.map(normalizeInstance)
      // 从实例中提取集群列表
      const clusterSet = new Set<string>(list.map((i: any) => i.clusterName).filter(Boolean))
      clusters.value = Array.from(clusterSet)
    }
  } catch (e: any) {
    ElMessage.error(`加载实例失败: ${e.message}`)
  } finally {
    instanceLoading.value = false
  }
}

function normalizeInstance(item: any): NacosInstance {
  return {
    ip: item.ip,
    port: item.port,
    clusterName: item.clusterName || 'DEFAULT',
    healthy: item.healthy ?? true,
    enabled: item.enabled ?? true,
    weight: item.weight ?? 1,
    ephemeral: item.ephemeral,
    metadata: item.metadata || {}
  }
}

// ==================== 上线/下线 ====================
async function toggleInstance(inst: NacosInstance) {
  if (!currentService.value) return
  const action = inst.enabled ? '下线' : '上线'
  try {
    await ElMessageBox.confirm(
      `确定将实例 ${inst.ip}:${inst.port} ${action}？`,
      `确认${action}`,
      { type: 'warning' }
    )
    inst._toggling = true
    const svc = currentService.value
    if (isV3()) {
      const params: Record<string, any> = {
        serviceName: svc.name,
        groupName: svc.groupName,
        ip: inst.ip,
        port: inst.port,
        clusterName: inst.clusterName,
        enabled: String(!inst.enabled)
      }
      if (selectedNamespace.value) params.namespaceId = selectedNamespace.value
      if (accessToken.value) params.accessToken = accessToken.value
      await nacosPut(`${getBaseURL()}/v3/admin/ns/instance`, params)
    } else {
      // 1.x/2.x 使用 PUT /v1/ns/instance，enabled 参数控制上下线
      const params: Record<string, any> = {
        serviceName: svc.name,
        groupName: svc.groupName,
        ip: inst.ip,
        port: inst.port,
        clusterName: inst.clusterName,
        enabled: String(!inst.enabled),
        weight: inst.weight,
        metadata: JSON.stringify(inst.metadata || {})
      }
      if (selectedNamespace.value) params.namespaceId = selectedNamespace.value
      if (accessToken.value) params.accessToken = accessToken.value
      await nacosPut(`${getBaseURL()}/v1/ns/instance`, params)
    }
    ElMessage.success(`${action}成功`)
    await loadInstances()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(`${action}失败: ${e.message}`)
  } finally {
    inst._toggling = false
  }
}

// ==================== 修改权重 ====================
function openWeightDialog(inst: NacosInstance) {
  weightTarget.value = inst
  weightValue.value = inst.weight
  weightDialogVisible.value = true
}

async function submitWeight() {
  if (!weightTarget.value || !currentService.value) return
  weightLoading.value = true
  try {
    const svc = currentService.value
    const inst = weightTarget.value
    if (isV3()) {
      const params: Record<string, any> = {
        serviceName: svc.name,
        groupName: svc.groupName,
        ip: inst.ip,
        port: inst.port,
        clusterName: inst.clusterName,
        weight: weightValue.value
      }
      if (selectedNamespace.value) params.namespaceId = selectedNamespace.value
      if (accessToken.value) params.accessToken = accessToken.value
      await nacosPut(`${getBaseURL()}/v3/admin/ns/instance`, params)
    } else {
      const params: Record<string, any> = {
        serviceName: svc.name,
        groupName: svc.groupName,
        ip: inst.ip,
        port: inst.port,
        clusterName: inst.clusterName,
        weight: weightValue.value,
        enabled: inst.enabled,
        metadata: JSON.stringify(inst.metadata || {})
      }
      if (selectedNamespace.value) params.namespaceId = selectedNamespace.value
      if (accessToken.value) params.accessToken = accessToken.value
      await nacosPut(`${getBaseURL()}/v1/ns/instance`, params)
    }
    ElMessage.success('权重已更新')
    weightDialogVisible.value = false
    await loadInstances()
  } catch (e: any) {
    ElMessage.error(`更新失败: ${e.message}`)
  } finally {
    weightLoading.value = false
  }
}

// ==================== 实例详情 ====================
function showInstanceDetail(inst: NacosInstance) {
  detailInstance.value = inst
  detailDialogVisible.value = true
}

// ==================== 监听实例启动事件 ====================
function onInstanceStatusChanged(instanceId: number, status: string) {
  if (status === 'running') loadConnections()
}

let healthTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await loadConnections()
  healthTimer = setInterval(() => {
    for (const conn of connections.value) {
      if (conn.id !== undefined) {
        window.api.connection.healthCheck(conn.server_url, conn.version)
          .then((r: any) => { connStatusMap.value[conn.id!] = r.reachable ? 'success' : 'fail' })
          .catch(() => { connStatusMap.value[conn.id!] = 'fail' })
      }
    }
  }, 15000)
  window.api.on('instance:status-changed', onInstanceStatusChanged)
})

onUnmounted(() => {
  if (healthTimer) clearInterval(healthTimer)
  window.api.off('instance:status-changed', onInstanceStatusChanged)
})
</script>

<style scoped>
.service-view { display: flex; height: calc(100vh - 60px); gap: 0; overflow: hidden; }

/* ===== 左侧面板 ===== */
.left-panel { width: 220px; min-width: 220px; border-right: 1px solid #e4e7ed; display: flex; flex-direction: column; background: #f9fafc; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 12px 10px; border-bottom: 1px solid #e4e7ed; }
.panel-title { font-weight: 600; font-size: 14px; color: #303133; }
.connection-list { flex: 1; overflow-y: auto; padding: 8px 0; }
.connection-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; transition: background 0.2s; position: relative; }
.connection-item:hover { background: #ecf5ff; }
.connection-item.active { background: #ecf5ff; border-left: 3px solid #409eff; }
.conn-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot-green { background: #67c23a; }
.dot-red { background: #f56c6c; }
.dot-gray { background: #c0c4cc; }
.conn-info { flex: 1; min-width: 0; }
.conn-name { font-size: 13px; font-weight: 500; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conn-url { font-size: 11px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.refresh-btn { padding: 8px; border-top: 1px solid #e4e7ed; text-align: center; }

/* ===== 右侧面板 ===== */
.right-panel { flex: 1; display: flex; flex-direction: column; padding: 20px; overflow: hidden; }
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.toolbar-left { display: flex; align-items: center; gap: 8px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.active-conn-name { font-weight: 600; font-size: 14px; color: #303133; }
.pagination { display: flex; justify-content: flex-end; padding: 12px 0 0; }
.service-name-link { color: #409eff; cursor: pointer; font-weight: 500; }
.service-name-link:hover { text-decoration: underline; }

/* ===== 实例对话框 ===== */
.instance-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.instance-count { font-size: 13px; color: #606266; margin-left: auto; }
.instance-count .healthy { color: #67c23a; }
.metadata-text { font-size: 12px; color: #606266; font-family: monospace; }
.metadata-detail { margin: 0; font-size: 12px; line-height: 1.6; font-family: "Fira Code", Consolas, monospace; white-space: pre-wrap; word-break: break-all; }

/* ===== 深色模式适配 ===== */
:deep(.is-dark) .left-panel { background: #16213e; border-color: #2d3748; }
:deep(.is-dark) .panel-header { border-color: #2d3748; }
:deep(.is-dark) .panel-title { color: #e2e8f0; }
:deep(.is-dark) .connection-item:hover { background: #2d3748; }
:deep(.is-dark) .connection-item.active { background: #2d3748; border-color: #60a5fa; }
:deep(.is-dark) .conn-name { color: #e2e8f0; }
:deep(.is-dark) .refresh-btn { border-color: #2d3748; }
</style>
