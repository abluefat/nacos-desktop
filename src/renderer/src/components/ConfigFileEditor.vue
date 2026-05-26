<template>
  <el-dialog
    v-model="visible"
    :title="`配置文件管理 - ${instanceName}`"
    width="960px"
    top="5vh"
    destroy-on-close
    @open="onOpen"
    @close="onClose"
  >
    <div class="conf-editor-layout">
      <!-- 左侧：文件列表 -->
      <div class="conf-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">配置文件</span>
          <el-button size="small" text :loading="listLoading" @click="loadFileList">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>

        <!-- 目录路径 -->
        <div v-if="confDir" class="conf-dir-path" :title="confDir">
          <el-icon><FolderOpened /></el-icon>
          <span>{{ shortPath(confDir) }}</span>
        </div>

        <el-scrollbar class="sidebar-scroll">
          <div
            v-for="f in fileList"
            :key="f.path"
            class="conf-file-item"
            :class="{ active: currentFile?.path === f.path }"
            @click="openFile(f)"
          >
            <el-icon class="file-icon" :class="getFileIconClass(f.name)">
              <Document />
            </el-icon>
            <div class="file-meta">
              <span class="file-name">{{ f.name }}</span>
              <span class="file-size">{{ formatSize(f.size) }}</span>
            </div>
            <el-tag v-if="isModified(f.path)" size="small" type="warning" class="modified-tag">已修改</el-tag>
          </div>
          <div v-if="!listLoading && fileList.length === 0" class="sidebar-empty">暂无配置文件</div>
        </el-scrollbar>
      </div>

      <!-- 右侧：编辑器区域 -->
      <div class="conf-editor-area">
        <!-- 未选择文件 -->
        <el-empty v-if="!currentFile" description="点击左侧文件开始编辑" :image-size="60" style="margin-top: 80px" />

        <template v-else>
          <!-- 编辑器工具栏 -->
          <div class="editor-toolbar">
            <div class="toolbar-left">
              <span class="current-file-name">{{ currentFile.name }}</span>
              <el-tag size="small" type="info">{{ getFileLang(currentFile.name) }}</el-tag>
            </div>
            <div class="toolbar-right">
              <el-tooltip content="格式化内容" placement="top">
                <el-button size="small" text :disabled="!canFormat" @click="handleFormat">
                  <el-icon><DocumentChecked /></el-icon>格式化
                </el-button>
              </el-tooltip>
              <el-tooltip :content="editorDark ? '切换浅色主题' : '切换深色主题'" placement="top">
                <el-button size="small" text @click="toggleEditorTheme">
                  <el-icon><Sunny v-if="editorDark" /><Moon v-else /></el-icon>
                </el-button>
              </el-tooltip>
              <el-button size="small" text @click="handleRestore">
                <el-icon><RefreshLeft /></el-icon>还原
              </el-button>
              <el-button
                size="small"
                type="primary"
                :loading="saveLoading"
                :disabled="!isModified(currentFile.path)"
                @click="handleSave"
              >
                <el-icon><Check /></el-icon>保存
              </el-button>
            </div>
          </div>

          <!-- 编辑器本体 -->
          <div class="editor-wrap" :class="{ 'editor-dark': editorDark }">
            <div ref="editorEl" class="editor-container" />
          </div>

          <!-- 配置项解读面板 -->
          <div class="docs-panel" :class="{ collapsed: !docsVisible }">
            <div class="docs-header" @click="docsVisible = !docsVisible">
              <div class="docs-header-left">
                <el-icon><InfoFilled /></el-icon>
                <span>配置项解读</span>
                <el-tag size="small" type="info">{{ matchedDocs.length }}/{{ totalKeys }}</el-tag>
              </div>
              <el-icon class="docs-toggle"><ArrowUp v-if="docsVisible" /><ArrowDown v-else /></el-icon>
            </div>
            <div v-if="docsVisible" class="docs-body">
              <el-input
                v-model="docsFilter"
                size="small"
                placeholder="搜索配置项..."
                clearable
                prefix-icon="Search"
                class="docs-search"
              />
              <el-scrollbar class="docs-scroll">
                <div
                  v-for="item in filteredDocs"
                  :key="item.key"
                  class="docs-item"
                  @click="locateConfigItem(item.key)"
                >
                  <div class="docs-item-header">
                    <code class="docs-key">{{ item.key }}</code>
                    <el-tag v-if="item.section" size="small" :type="getSectionType(item.section)">{{ item.section }}</el-tag>
                  </div>
                  <div class="docs-desc">{{ item.desc }}</div>
                  <div v-if="item.default !== undefined" class="docs-default">
                    默认值：<code>{{ item.default }}</code>
                  </div>
                </div>
                <div v-if="filteredDocs.length === 0" class="docs-empty">
                  {{ docsFilter ? '无匹配配置项' : (currentDocKeys.length ? '当前文件配置项均无内置释义' : '仅 .properties 文件支持配置项解读') }}
                </div>
              </el-scrollbar>
            </div>
          </div>

          <!-- 备份提示 -->
          <div v-if="lastBackup" class="backup-hint">
            <el-icon><InfoFilled /></el-icon>
            上次保存前已自动备份到：{{ lastBackup }}
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <span class="footer-hint" v-if="currentFile">
          <el-icon><InfoFilled /></el-icon>
          保存前会自动创建 .bak 备份文件
        </span>
        <el-button @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Refresh, FolderOpened, Document, DocumentChecked, Sunny, Moon,
  RefreshLeft, Check, InfoFilled, ArrowUp, ArrowDown
} from '@element-plus/icons-vue'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { yaml } from '@codemirror/lang-yaml'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { oneDark } from '@codemirror/theme-one-dark'
import { lintGutter } from '@codemirror/lint'

// ==================== Props / Emits ====================
const props = defineProps<{
  instanceId: number
  instanceName: string
}>()

// ==================== 对话框状态 ====================
const visible = defineModel<boolean>({ default: false })

// ==================== 文件列表 ====================
interface ConfFile { name: string; path: string; size: number; modified: string }

const listLoading = ref(false)
const fileList = ref<ConfFile[]>([])
const confDir = ref('')
const currentFile = ref<ConfFile | null>(null)

// 跟踪各文件的原始内容（未修改前的版本）
const originalContents = ref<Record<string, string>>({})
// 跟踪各文件的当前编辑内容
const editedContents = ref<Record<string, string>>({})

function isModified(filePath: string): boolean {
  const orig = originalContents.value[filePath]
  const curr = editedContents.value[filePath]
  return orig !== undefined && curr !== undefined && orig !== curr
}

// ==================== 编辑器 ====================
const editorEl = ref<HTMLElement | null>(null)
const editorDark = ref(false)
const saveLoading = ref(false)
const lastBackup = ref('')

let editorView: EditorView | null = null
const modeCompartment = new Compartment()
const themeCompartment = new Compartment()

// 获取文件语言模式
function getFileLang(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    properties: 'Properties', conf: 'Text', xml: 'XML',
    yaml: 'YAML', yml: 'YAML', json: 'JSON',
    sh: 'Shell', cmd: 'Batch', txt: 'Text', cfg: 'Text', ini: 'INI'
  }
  return map[ext] || 'Text'
}

function getLangExt(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'yaml' || ext === 'yml') return yaml()
  if (ext === 'json') return json()
  if (ext === 'xml') return xml()
  return []
}

const canFormat = computed(() => {
  if (!currentFile.value) return false
  const ext = currentFile.value.name.split('.').pop()?.toLowerCase() || ''
  return ['json', 'yaml', 'yml', 'xml'].includes(ext)
})

// ==================== 配置项解读 ====================
const docsVisible = ref(false)
const docsFilter = ref('')

interface ConfigDoc {
  key: string
  desc: string
  default?: string
  section?: string
}

/** Nacos 内置配置项释义字典 */
const NACOS_CONFIG_DOCS: ConfigDoc[] = [
  // 服务基础
  { key: 'server.port', desc: 'Nacos 服务端监听端口', default: '8848', section: '服务基础' },
  { key: 'server.servlet.contextPath', desc: 'Nacos Web 控制台的上下文路径', default: '/nacos', section: '服务基础' },
  { key: 'server.tomcat.accesslog.enabled', desc: '是否启用 Tomcat 访问日志', default: 'false', section: '服务基础' },
  { key: 'server.tomcat.basedir', desc: 'Tomcat 临时文件目录（建议配置以避免临时目录清理问题）', section: '服务基础' },

  // 命名空间
  { key: 'nacos.core.auth.enabled', desc: '是否开启鉴权（生产环境建议开启）', default: 'false', section: '鉴权安全' },
  { key: 'nacos.core.auth.system.type', desc: '鉴权系统类型', default: 'nacos', section: '鉴权安全' },
  { key: 'nacos.core.auth.server.identity.key', desc: '服务端身份识别 Key（v2.2+ 用于服务间身份验证）', section: '鉴权安全' },
  { key: 'nacos.core.auth.server.identity.value', desc: '服务端身份识别 Value（v2.2+ 需与客户端一致）', section: '鉴权安全' },
  { key: 'nacos.core.auth.plugin.nacos.token.secret.key', desc: '鉴权 Token 密钥（默认值有安全风险，生产环境必须修改）', section: '鉴权安全' },
  { key: 'nacos.core.auth.default.token.expire.seconds', desc: 'Token 默认过期时间（秒）', default: '18000', section: '鉴权安全' },

  // 数据库
  { key: 'spring.datasource.platform', desc: '数据库类型，支持 mysql / embedded（单机模式）', default: 'mysql', section: '数据库' },
  { key: 'db.num', desc: '数据库实例数量（单机为 1）', default: '1', section: '数据库' },
  { key: 'db.url.0', desc: '主数据库 JDBC 连接地址', section: '数据库' },
  { key: 'db.user.0', desc: '主数据库用户名', section: '数据库' },
  { key: 'db.password.0', desc: '主数据库密码', section: '数据库' },
  { key: 'db.pool.config.driverClassName', desc: '数据库驱动类名', default: 'com.mysql.cj.jdbc.Driver', section: '数据库' },
  { key: 'db.pool.config.connectionTimeout', desc: '数据库连接超时时间（毫秒）', default: '30000', section: '数据库' },
  { key: 'db.pool.config.maxPoolSize', desc: '数据库连接池最大连接数', default: '20', section: '数据库' },
  { key: 'db.pool.config.minIdle', desc: '连接池最小空闲连接数', default: '5', section: '数据库' },

  // 集群
  { key: 'cluster.conf', desc: '集群节点列表文件路径（非 properties 项，需编辑 cluster.conf 文件）', section: '集群' },
  { key: 'nacos.core.cluster.name', desc: '集群名称', section: '集群' },
  { key: 'nacos.core.cluster.port', desc: '集群 Raft 通信端口（默认为 server.port - 1000）', section: '集群' },
  { key: 'nacos.core.cluster.local.ip', desc: '集群本地节点 IP（不配置则自动获取）', section: '集群' },
  { key: 'nacos.core.cluster.local.port', desc: '集群本地节点 Raft 端口', section: '集群' },

  // 日志
  { key: 'nacos.logging.default.config.enabled', desc: '是否使用 Nacos 默认日志配置', default: 'true', section: '日志' },
  { key: 'nacos.logs.path', desc: 'Nacos 日志文件存储目录', section: '日志' },

  // 命名空间
  { key: 'management.endpoints.web.exposure.include', desc: 'Spring Actuator 暴露的端点（监控/健康检查）', default: '*', section: '监控' },
  { key: 'management.metrics.export.elastic.enabled', desc: '是否启用 ElasticSearch 指标导出', default: 'false', section: '监控' },

  // 2.x 协议
  { key: 'nacos.core.protocol.v2.enable', desc: '是否启用 gRPC 协议（v2.x 版本建议开启）', section: '协议' },
  { key: 'nacos.core.grpc.port', desc: 'gRPC 通信端口偏移量（默认在主端口 +1000）', section: '协议' },

  // 控制台
  { key: 'nacos.console.ui.enabled', desc: '是否启用 Web 控制台', default: 'true', section: '控制台' },
  { key: 'nacos.core.param.check.enabled', desc: '是否开启参数校验', default: 'true', section: '控制台' },

  // JVM (启动参数相关说明)
  { key: 'nacos.inetutils.ip-address', desc: '手动指定 Nacos 服务绑定的 IP 地址（多网卡时有用）', section: '网络' },
  { key: 'nacos.inetutils.prefer-hostname-over-ip', desc: '是否优先使用主机名而非 IP', default: 'false', section: '网络' },
  { key: 'nacos.inetutils.ignore-interfaces', desc: '忽略的网络接口名称列表（多网卡时排除不需要的网卡）', section: '网络' },

  // Raft
  { key: 'nacos.core.auth.enable.userAgentAuthWhite', desc: '是否通过 User-Agent 白名单进行鉴权放行', section: '鉴权安全' },

  // 隔离
  { key: 'nacos.core.auth.enable.type', desc: '鉴权启用模式', default: '0', section: '鉴权安全' },
]

const NACOS_DOCS_MAP = new Map<string, ConfigDoc>()
NACOS_CONFIG_DOCS.forEach(d => NACOS_DOCS_MAP.set(d.key, d))

/** 从编辑器内容中提取的配置 key 列表（仅 .properties 文件） */
const currentDocKeys = computed(() => {
  if (!currentFile.value) return []
  const ext = currentFile.value.name.split('.').pop()?.toLowerCase() || ''
  if (ext !== 'properties') return []
  const content = editedContents.value[currentFile.value.path] || ''
  const keys: string[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      keys.push(trimmed.substring(0, eqIdx).trim())
    }
  }
  return keys
})

/** 匹配到释义的配置项 */
const matchedDocs = computed(() => {
  return currentDocKeys.value
    .map(key => {
      const doc = NACOS_DOCS_MAP.get(key)
      if (doc) return { ...doc, key, matched: true }
      return { key, desc: '', matched: false, section: '未收录' } as ConfigDoc & { matched: boolean }
    })
    .sort((a, b) => {
      if (a.matched && !b.matched) return -1
      if (!a.matched && b.matched) return 1
      return a.key.localeCompare(b.key)
    })
})

const totalKeys = computed(() => currentDocKeys.value.length)

const filteredDocs = computed(() => {
  if (!docsFilter.value) return matchedDocs.value
  const kw = docsFilter.value.toLowerCase()
  return matchedDocs.value.filter(
    item => item.key.toLowerCase().includes(kw) || item.desc.toLowerCase().includes(kw) || (item.section?.toLowerCase().includes(kw))
  )
})

function getSectionType(section: string) {
  const map: Record<string, string> = {
    '服务基础': '', '数据库': 'success', '鉴权安全': 'danger',
    '集群': 'warning', '日志': 'info', '监控': '', '协议': '',
    '控制台': '', '网络': 'warning', '未收录': 'info'
  }
  return (map[section] || 'info') as any
}

/** 点击配置项，跳转到编辑器中对应行 */
function locateConfigItem(key: string) {
  if (!editorView || !currentFile.value) return
  const content = editorView.state.doc.toString()
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0 && trimmed.substring(0, eqIdx).trim() === key) {
      const lineStart = content.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
      editorView.dispatch({
        selection: { anchor: lineStart },
        scrollIntoView: true
      })
      return
    }
  }
}

function buildExtensions(fileName: string, dark: boolean) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    lintGutter(),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
    modeCompartment.of(getLangExt(fileName)),
    themeCompartment.of(dark ? oneDark : []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && currentFile.value) {
        editedContents.value[currentFile.value.path] = update.state.doc.toString()
      }
    }),
    EditorView.theme({
      '&': { height: '100%', fontSize: '13px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: '"Fira Code","Cascadia Code","Consolas",monospace' },
      '.cm-content': { caretColor: '#409eff' },
      '&.cm-focused .cm-cursor': { borderLeftColor: '#409eff' },
      '.cm-activeLine': { backgroundColor: 'rgba(64,158,255,0.05)' }
    })
  ]
}

function initEditor(content: string, fileName: string) {
  if (editorView) { editorView.destroy(); editorView = null }
  if (!editorEl.value) return
  const state = EditorState.create({
    doc: content,
    extensions: buildExtensions(fileName, editorDark.value)
  })
  editorView = new EditorView({ state, parent: editorEl.value })
}

function setEditorContent(content: string) {
  if (!editorView) return
  const current = editorView.state.doc.toString()
  if (current === content) return
  editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: content } })
}

watch(editorEl, (el) => {
  if (el && currentFile.value) {
    nextTick(() => {
      const content = editedContents.value[currentFile.value!.path] ?? originalContents.value[currentFile.value!.path] ?? ''
      initEditor(content, currentFile.value!.name)
    })
  }
})

// ==================== 操作 ====================
async function loadFileList() {
  listLoading.value = true
  try {
    const result = await window.api.instance.confFiles(props.instanceId)
    fileList.value = result.files
    confDir.value = result.confDir
  } catch (e: any) {
    ElMessage.error(`加载配置文件列表失败: ${e.message}`)
  } finally {
    listLoading.value = false
  }
}

async function openFile(file: ConfFile) {
  // 如果当前有未保存修改，提示
  if (currentFile.value && isModified(currentFile.value.path) && currentFile.value.path !== file.path) {
    try {
      await ElMessageBox.confirm(
        `「${currentFile.value.name}」有未保存的修改，切换文件后修改仍在内存中保留，可继续编辑。是否继续切换？`,
        '提示',
        { confirmButtonText: '继续切换', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
  }

  currentFile.value = file

  // 如果尚未加载过，从磁盘读取
  if (originalContents.value[file.path] === undefined) {
    try {
      const result = await window.api.instance.readConf(file.path)
      originalContents.value[file.path] = result.content
      editedContents.value[file.path] = result.content
    } catch (e: any) {
      ElMessage.error(`读取文件失败: ${e.message}`)
      currentFile.value = null
      return
    }
  }

  // 初始化编辑器
  const content = editedContents.value[file.path] ?? ''
  nextTick(() => initEditor(content, file.name))
}

function handleFormat() {
  if (!editorView || !currentFile.value) return
  const content = editorView.state.doc.toString()
  const ext = currentFile.value.name.split('.').pop()?.toLowerCase() || ''
  let formatted = content
  try {
    if (ext === 'json') {
      formatted = JSON.stringify(JSON.parse(content), null, 2)
    } else if (ext === 'yaml' || ext === 'yml') {
      formatted = content.split('\n').map((l: string) => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n')
    }
    if (formatted !== content) {
      editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: formatted } })
      ElMessage.success('格式化成功')
    } else {
      ElMessage.info('内容已是标准格式')
    }
  } catch {
    ElMessage.error('格式化失败：内容格式不正确')
  }
}

function handleRestore() {
  if (!currentFile.value) return
  const original = originalContents.value[currentFile.value.path]
  if (original === undefined) return
  editedContents.value[currentFile.value.path] = original
  setEditorContent(original)
  ElMessage.success('已还原为磁盘原始内容')
}

async function handleSave() {
  if (!currentFile.value) return
  const content = editedContents.value[currentFile.value.path] ?? ''
  const file = currentFile.value

  // 二次确认
  try {
    await ElMessageBox.confirm(
      `确定保存「${file.name}」？\n保存前将自动创建 .bak 备份文件。`,
      '确认保存',
      { confirmButtonText: '保存', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  saveLoading.value = true
  try {
    const result = await window.api.instance.writeConf(file.path, content)
    if (result.success) {
      // 更新原始内容（已保存）
      originalContents.value[file.path] = content
      lastBackup.value = result.backupPath
      ElMessage.success(`保存成功！备份: ${result.backupPath.split(/[\\/]/).pop()}`)
    }
  } catch (e: any) {
    ElMessage.error(`保存失败: ${e.message}`)
  } finally {
    saveLoading.value = false
  }
}

function toggleEditorTheme() {
  editorDark.value = !editorDark.value
  if (editorView) {
    editorView.dispatch({ effects: themeCompartment.reconfigure(editorDark.value ? oneDark : []) })
  }
}

// ==================== 工具函数 ====================
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function shortPath(p: string): string {
  if (p.length <= 40) return p
  const parts = p.replace(/\\/g, '/').split('/')
  if (parts.length <= 3) return p
  return '.../' + parts.slice(-3).join('/')
}

function getFileIconClass(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'properties') return 'icon-properties'
  if (ext === 'xml') return 'icon-xml'
  if (ext === 'yaml' || ext === 'yml') return 'icon-yaml'
  if (ext === 'json') return 'icon-json'
  if (ext === 'conf') return 'icon-conf'
  if (ext === 'sh' || ext === 'cmd') return 'icon-script'
  return ''
}

// ==================== 生命周期 ====================
function onOpen() {
  lastBackup.value = ''
  currentFile.value = null
  loadFileList()
}

function onClose() {
  if (editorView) { editorView.destroy(); editorView = null }
}
</script>

<style scoped>
.conf-editor-layout {
  display: flex;
  height: 600px;
  gap: 0;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

/* ===== 左侧文件列表 ===== */
.conf-sidebar {
  width: 210px;
  min-width: 210px;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  background: #f9fafc;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #e4e7ed;
}

.sidebar-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}

.conf-dir-path {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 11px;
  color: #909399;
  border-bottom: 1px solid #f0f0f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

.conf-dir-path .el-icon {
  flex-shrink: 0;
  color: #e6a23c;
}

.sidebar-scroll {
  flex: 1;
}

.conf-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.conf-file-item:hover {
  background: #ecf5ff;
}

.conf-file-item.active {
  background: #ecf5ff;
  border-left: 3px solid #409eff;
  padding-left: 9px;
}

.file-icon {
  font-size: 14px;
  flex-shrink: 0;
  color: #909399;
}

.icon-properties { color: #67c23a; }
.icon-xml { color: #e6a23c; }
.icon-yaml { color: #409eff; }
.icon-json { color: #f56c6c; }
.icon-conf { color: #606266; }
.icon-script { color: #9c27b0; }

.file-meta {
  flex: 1;
  min-width: 0;
}

.file-name {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 11px;
  color: #c0c4cc;
}

.modified-tag {
  flex-shrink: 0;
}

.sidebar-empty {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 12px;
  font-size: 13px;
}

/* ===== 右侧编辑器 ===== */
.conf-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #e4e7ed;
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.current-file-name {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}

.editor-wrap {
  flex: 1;
  overflow: hidden;
  border-bottom: 1px solid #e4e7ed;
}

.editor-wrap.editor-dark {
  background: #282c34;
}

.editor-container {
  height: 100%;
  overflow: hidden;
}

.backup-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: #67c23a;
  background: #f0f9eb;
  flex-shrink: 0;
}

/* ===== 弹窗底部 ===== */
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

/* ===== 配置项解读面板 ===== */
.docs-panel {
  border-top: 1px solid #e4e7ed;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.docs-panel.collapsed {
  max-height: 36px;
}

.docs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
  background: #f5f7fa;
  transition: background 0.15s;
}

.docs-header:hover {
  background: #ecf5ff;
}

.docs-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.docs-toggle {
  color: #909399;
  font-size: 14px;
}

.docs-body {
  display: flex;
  flex-direction: column;
  height: 200px;
}

.docs-search {
  padding: 6px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid #f0f0f0;
}

.docs-scroll {
  flex: 1;
}

.docs-item {
  padding: 8px 12px;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
  transition: background 0.1s;
}

.docs-item:hover {
  background: #ecf5ff;
}

.docs-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.docs-key {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: #409eff;
  font-weight: 600;
  word-break: break-all;
}

.docs-desc {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.docs-default {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.docs-default code {
  background: #f0f2f5;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  color: #67c23a;
}

.docs-empty {
  text-align: center;
  color: #c0c4cc;
  padding: 30px 12px;
  font-size: 12px;
}
</style>
