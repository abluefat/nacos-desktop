<template>
  <div class="config-view">
    <!-- 左侧：连接列表 -->
    <div class="left-panel">
      <div class="panel-header">
        <span class="panel-title">连接</span>
        <el-button size="small" type="primary" :icon="Plus" @click="handleAddConnection" />
      </div>

      <el-empty v-if="connections.length === 0" description="暂无连接" :image-size="60">
        <el-button size="small" type="primary" @click="handleAddConnection">添加</el-button>
      </el-empty>

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
            <div class="conn-name">{{ conn.name }}</div>
            <div class="conn-url">{{ conn.server_url }}</div>
          </div>
          <el-dropdown size="small" trigger="click" @click.stop>
            <el-icon class="conn-more"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleEditConnection(conn)">编辑</el-dropdown-item>
                <el-dropdown-item @click="handleDeleteConnection(conn)" style="color:#f56c6c">删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
      <!-- 未选中连接 -->
      <el-empty v-if="!activeConnection" description="请选择左侧连接以查看配置" :image-size="80" />

      <template v-else>
        <!-- 未认证提示横幅 -->
        <div v-if="loginStatus !== 'success'" class="login-banner" :class="loginStatus === 'fail' ? 'banner-fail' : 'banner-none'">
          <div class="banner-content">
            <el-icon class="banner-icon"><Warning /></el-icon>
            <span v-if="loginStatus === 'fail'" class="banner-text">
              认证失败，用户名或密码不正确，无法加载配置
            </span>
            <span v-else class="banner-text">
              当前连接未配置用户名，如需访问受保护的 Nacos，请手动登录
            </span>
          </div>
          <el-button size="small" type="primary" plain @click="openLoginDialog" :loading="loginLoading">
            <el-icon><Key /></el-icon>{{ loginStatus === 'fail' ? '重新登录' : '去登录' }}
          </el-button>
        </div>

        <!-- 顶部工具栏 -->
        <div class="toolbar">
          <div class="toolbar-left">
            <span class="active-conn-name">{{ activeConnection.name }}</span>
            <el-tag v-if="loginStatus === 'success'" type="success" size="small">
              <el-icon style="vertical-align: middle"><CircleCheck /></el-icon> 已认证
            </el-tag>
            <el-button v-if="loginStatus === 'success'" size="small" text @click="openLoginDialog" :loading="loginLoading">
              <el-icon><Key /></el-icon>重新登录
            </el-button>
          </div>
          <div class="toolbar-right">
            <el-select
              v-model="selectedNamespace"
              placeholder="命名空间"
              size="small"
              style="width: 180px"
              filterable
              @change="handleNamespaceChange"
            >
              <el-option label="public (默认)" value="" />
              <el-option
                v-for="ns in namespaces"
                :key="ns.namespace"
                :label="`${ns.namespaceShowName} (${ns.namespace})`"
                :value="ns.namespace"
              />
            </el-select>

            <el-input v-model="searchDataId" placeholder="Data ID" size="small" clearable style="width: 150px" />
            <el-input v-model="searchGroup" placeholder="Group" size="small" clearable style="width: 130px" />
            <el-button size="small" type="primary" @click="loadConfigs" :icon="Search">搜索</el-button>
            <el-button size="small" type="success" @click="handleCreateConfig" :icon="Plus">新增</el-button>
            <el-dropdown size="small">
              <el-button size="small">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleExport">导出全部配置</el-dropdown-item>
                  <el-dropdown-item @click="handleImport">从文件导入</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <!-- 配置列表 -->
        <el-table
          :data="configs"
          stripe
          v-loading="tableLoading"
          style="width: 100%"
          height="calc(100vh - 260px)"
          @row-dblclick="handleRowDoubleClick"
        >
          <el-table-column prop="dataId" label="Data ID" min-width="200" show-overflow-tooltip />
          <el-table-column prop="group" label="Group" width="150" />
          <el-table-column prop="type" label="类型" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="getTypeTagType(row.type)">{{ row.type || 'text' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="appName" label="归属应用" width="130" show-overflow-tooltip />
          <el-table-column prop="lastModifiedTime" label="最后修改" width="160">
            <template #default="{ row }">{{ formatDate(row.lastModifiedTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="handleQuickView(row)">查看</el-button>
              <el-button size="small" @click="handleEditConfig(row)">编辑</el-button>
              <el-button size="small" type="info" plain @click="handleViewHistory(row)">历史</el-button>
              <el-button size="small" type="danger" plain @click="handleDeleteConfig(row)">删除</el-button>
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
            @current-change="loadConfigs"
            @size-change="loadConfigs"
          />
        </div>
      </template>
    </div>

    <!-- ========== 登录对话框 ========== -->
    <el-dialog v-model="loginDialogVisible" title="Nacos 登录" width="380px">
      <el-form :model="loginForm" ref="loginFormRef" label-width="70px">
        <el-form-item label="用户名" :rules="[{ required: true, message: '请输入用户名' }]" prop="username">
          <el-input v-model="loginForm.username" placeholder="nacos" clearable />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="loginForm.password" type="password" placeholder="nacos" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="loginDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitLogin" :loading="loginLoading">登录</el-button>
      </template>
    </el-dialog>

    <!-- ========== 添加/编辑连接对话框 ========== -->
    <el-dialog v-model="connectionDialogVisible" :title="isEditConn ? '编辑连接' : '添加连接'" width="440px">
      <el-form :model="connectionForm" :rules="connectionRules" ref="connectionFormRef" label-width="90px">
        <el-form-item label="连接名称" prop="name">
          <el-input v-model="connectionForm.name" placeholder="如: 本地开发" />
        </el-form-item>
        <el-form-item label="服务地址" prop="server_url">
          <el-input v-model="connectionForm.server_url" placeholder="http://localhost:8848" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="connectionForm.username" placeholder="nacos（留空跳过鉴权）" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="connectionForm.password" type="password" placeholder="nacos" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="connectionDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitConnection">确定</el-button>
      </template>
    </el-dialog>

    <!-- ========== 新增/编辑配置对话框 ========== -->
    <el-dialog
      v-model="configDialogVisible"
      :title="isConfigEdit ? `编辑: ${configForm.dataId}` : '新增配置'"
      width="900px"
      destroy-on-close
    >
      <el-tabs v-model="configTabName">
        <!-- 编辑 Tab -->
        <el-tab-pane label="编辑" name="edit">
          <el-form :model="configForm" :rules="configRules" ref="configFormRef" label-width="90px">
            <el-row :gutter="16">
              <el-col :span="14">
                <el-form-item label="Data ID" prop="dataId">
                  <el-input v-model="configForm.dataId" :disabled="isConfigEdit" placeholder="如: application.yml" />
                </el-form-item>
              </el-col>
              <el-col :span="10">
                <el-form-item label="Group" prop="group">
                  <el-input v-model="configForm.group" placeholder="DEFAULT_GROUP" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="10">
                <el-form-item label="配置类型">
                  <el-select v-model="configForm.type" style="width: 100%">
                    <el-option label="YAML" value="yaml" />
                    <el-option label="Properties" value="properties" />
                    <el-option label="JSON" value="json" />
                    <el-option label="XML" value="xml" />
                    <el-option label="Text" value="text" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="14">
                <el-form-item label="归属应用">
                  <el-input v-model="configForm.appName" placeholder="可选" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="描述">
              <el-input v-model="configForm.desc" placeholder="可选" />
            </el-form-item>

            <!-- 代码编辑器 -->
            <el-form-item label="配置内容" prop="content" class="editor-form-item">
              <div class="editor-toolbar">
                <span class="editor-mode-label">格式：{{ getModeLabel(configForm.type) }}</span>
                <el-button size="small" text @click="handleFormatContent">
                  <el-icon><DocumentChecked /></el-icon>格式化
                </el-button>
                <el-button size="small" text @click="handleToggleTheme" :title="editorDark ? '切换浅色' : '切换深色'">
                  <el-icon><Sunny v-if="editorDark" /><Moon v-else /></el-icon>
                </el-button>
              </div>
              <div class="editor-wrapper" :class="{ 'editor-dark': editorDark }">
                <div ref="editorContainerRef" class="editor-container" />
              </div>
              <div v-if="editorError" class="editor-error">{{ editorError }}</div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 对比 Tab（仅编辑模式显示） -->
        <el-tab-pane v-if="isConfigEdit" label="对比变更" name="diff">
          <div class="diff-container">
            <div class="diff-header">
              <span class="diff-title">变更对比</span>
              <span class="diff-subtitle">左侧为当前服务器版本，右侧为您编辑的内容</span>
            </div>
            <div class="diff-body">
              <div class="diff-old">
                <div class="diff-pane-title">服务器当前版本</div>
                <pre class="diff-content">{{ originalContent || '（加载中...）' }}</pre>
              </div>
              <div class="diff-divider" />
              <div class="diff-new">
                <div class="diff-pane-title">编辑后的内容</div>
                <pre class="diff-content">{{ configForm.content || '（空）' }}</pre>
              </div>
            </div>
            <div class="diff-summary">
              <span v-if="originalContent !== configForm.content" class="diff-changed">
                <el-icon><Edit /></el-icon> 内容已修改
              </span>
              <span v-else class="diff-unchanged">
                <el-icon><CircleCheck /></el-icon> 内容未变化
              </span>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="configDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitConfig" :loading="submitLoading">发布</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ========== 快速预览对话框 ========== -->
    <el-dialog v-model="previewDialogVisible" :title="`查看: ${previewConfig?.dataId}`" width="800px" destroy-on-close>
      <div class="preview-header">
        <el-tag size="small" type="info">{{ previewConfig?.group }}</el-tag>
        <el-tag size="small" :type="getTypeTagType(previewConfig?.type)">{{ previewConfig?.type || 'text' }}</el-tag>
        <span class="preview-last-modified">最后修改: {{ formatDate(previewConfig?.lastModifiedTime) }}</span>
      </div>
      <div class="preview-wrapper" :class="{ 'preview-dark': previewDark }">
        <div ref="previewContainerRef" class="preview-editor" />
      </div>
      <template #footer>
        <el-button @click="previewDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="handleEditFromPreview">编辑此配置</el-button>
      </template>
    </el-dialog>

    <!-- ========== 历史版本对话框 ========== -->
    <el-dialog v-model="historyDialogVisible" title="配置历史" width="900px" destroy-on-close>
      <div class="history-header">
        <span class="history-title">{{ historyConfig?.dataId }}</span>
        <el-tag size="small">{{ historyConfig?.group }}</el-tag>
      </div>

      <el-table :data="historyList" v-loading="historyLoading" height="280px" stripe @selection-change="handleHistorySelection">
        <el-table-column type="selection" width="40" :selectable="(row: HistoryItem) => row.id !== historySelectedId" />
        <el-table-column prop="id" label="版本 ID" width="110" />
        <el-table-column prop="lastModifiedTime" label="修改时间" width="160">
          <template #default="{ row }">{{ formatDate(row.lastModifiedTime) }}</template>
        </el-table-column>
        <el-table-column prop="opType" label="操作" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.opType === 'I' ? 'success' : 'warning'">
              {{ row.opType === 'I' ? '新增' : '修改' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operIp" label="操作 IP" width="130" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="previewHistory(row)">查看</el-button>
            <el-button size="small" type="warning" plain @click="rollbackHistory(row)">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="history-pagination">
        <el-pagination
          v-model:current-page="historyPageNo"
          :total="historyTotal"
          :page-size="20"
          layout="total, prev, pager, next"
          small
          @current-change="(p) => { historyPageNo = p; loadHistory() }"
        />
      </div>

      <!-- 选中两条历史记录时显示对比 -->
      <div v-if="historyCompareItems.length === 2" class="history-compare">
        <div class="compare-header">
          <span>版本对比：<strong>{{ historyCompareItems[0].id }}</strong> vs <strong>{{ historyCompareItems[1].id }}</strong></span>
          <el-button size="small" text @click="historyCompareItems = []">清除对比</el-button>
        </div>
        <div class="compare-body">
          <div class="compare-old">
            <div class="compare-title">版本 {{ historyCompareItems[0].id }}（较旧）</div>
            <pre class="compare-content">{{ historyCompareItems[0].content || '（无法获取）' }}</pre>
          </div>
          <div class="compare-divider" />
          <div class="compare-new">
            <div class="compare-title">版本 {{ historyCompareItems[1].id }}（较新）</div>
            <pre class="compare-content">{{ historyCompareItems[1].content || '（无法获取）' }}</pre>
          </div>
        </div>
      </div>

      <!-- 预览内容 -->
      <div v-if="historyPreview" class="history-preview">
        <div class="preview-title">
          版本内容预览
          <el-button size="small" text @click="historyPreview = ''"><el-icon><Close /></el-icon></el-button>
        </div>
        <pre class="preview-content">{{ historyPreview }}</pre>
      </div>
    </el-dialog>

    <!-- ========== 导入预览对话框 ========== -->
    <el-dialog v-model="importPreviewDialogVisible" title="导入预览" width="760px" destroy-on-close>
      <div class="import-summary">
        <el-icon><Warning /></el-icon>
        将从文件导入 <strong>{{ importItems.length }}</strong> 条配置到当前命名空间
        <template v-if="selectedNamespace"> ({{ selectedNamespace }}) </template>
        <template v-else> (public) </template>
        ，同名配置将被覆盖。
      </div>

      <el-table :data="importItems" stripe height="320px" size="small">
        <el-table-column prop="dataId" label="Data ID" min-width="200" show-overflow-tooltip />
        <el-table-column prop="group" label="Group" width="150" />
        <el-table-column prop="type" label="类型" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="getTypeTagType(row.type)">{{ row.type || 'text' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="appName" label="应用" width="120" show-overflow-tooltip />
        <el-table-column label="内容" min-width="80">
          <template #default="{ row }">
            <span>{{ row.content ? `${row.content.length} 字符` : '空' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="importPreviewDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmImport" :loading="importLoading">确认导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Refresh, Search, ArrowDown, MoreFilled, Key, Warning, CircleCheck,
  DocumentChecked, Sunny, Moon, Edit, Close
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

// ==================== IPC 请求封装 ====================
function isConnRefusedError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('econnrefused') || msg.includes('econnreset')
    || msg.includes('network error') || msg.includes('socket hang up')
    || msg.includes('connection refused') || msg.includes('连接拒绝')
}

async function nacosRequest(options: {
  method?: string; url: string; params?: Record<string, any>; body?: string; headers?: Record<string, string>
}): Promise<any> {
  try {
    const result = await window.api.nacos.request(options)
    if (result.status >= 400) {
      const msg = typeof result.data === 'object'
        ? (result.data?.message || result.data?.msg || JSON.stringify(result.data))
        : String(result.data)
      throw new Error(msg || `HTTP ${result.status}`)
    }
    return result.data
  } catch (err: any) {
    if (isConnRefusedError(err)) throw new Error('ERR_CONNECTION_REFUSED')
    throw err
  }
}

async function nacosGet(url: string, params?: Record<string, any>): Promise<any> {
  return nacosRequest({ method: 'GET', url, params })
}

async function nacosPost(url: string, formData: Record<string, string>, params?: Record<string, any>): Promise<any> {
  const body = Object.entries(formData)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (params && Object.keys(params).length > 0) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }
  return nacosRequest({ method: 'POST', url, body, headers })
}

async function nacosDelete(url: string, params?: Record<string, any>): Promise<any> {
  return nacosRequest({ method: 'DELETE', url, params })
}

// ==================== CodeMirror 编辑器管理 ====================
type EditorMode = 'yaml' | 'json' | 'properties' | 'xml' | 'text'

const editorContainerRef = ref<HTMLElement | null>(null)
const previewContainerRef = ref<HTMLElement | null>(null)
let editorView: EditorView | null = null
let previewView: EditorView | null = null
const editorDark = ref(false)
const previewDark = ref(false)
const editorError = ref('')
const modeCompartment = new Compartment()
const themeCompartment = new Compartment()
const editableCompartment = new Compartment()

function getLangExtension(mode: EditorMode) {
  switch (mode) {
    case 'yaml': return yaml()
    case 'json': return json()
    case 'xml': return xml()
    default: return []
  }
}

function getModeLabel(mode: string | undefined): string {
  const map: Record<string, string> = { yaml: 'YAML', json: 'JSON', properties: 'Properties', xml: 'XML', text: 'Text' }
  return map[mode || 'text'] || 'Text'
}

function buildEditorExtensions(mode: EditorMode, dark: boolean, editable: boolean) {
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
    modeCompartment.of(getLangExtension(mode)),
    themeCompartment.of(dark ? oneDark : []),
    editableCompartment.of(EditorView.editable.of(editable)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        configForm.value.content = update.state.doc.toString()
      }
    }),
    EditorView.theme({
      '&': { height: '100%', fontSize: '13px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace' },
      '.cm-content': { caretColor: '#409eff' },
      '&.cm-focused .cm-cursor': { borderLeftColor: '#409eff' },
      '.cm-activeLine': { backgroundColor: 'rgba(64, 158, 255, 0.06)' }
    })
  ]
}

function initEditor(content: string, mode: EditorMode) {
  if (editorView) { editorView.destroy(); editorView = null }
  if (!editorContainerRef.value) return
  const state = EditorState.create({ doc: content, extensions: buildEditorExtensions(mode, editorDark.value, true) })
  editorView = new EditorView({ state, parent: editorContainerRef.value })
}

function initPreview(content: string, mode: EditorMode) {
  if (previewView) { previewView.destroy(); previewView = null }
  if (!previewContainerRef.value) return
  const state = EditorState.create({ doc: content, extensions: buildEditorExtensions(mode, previewDark.value, false) })
  previewView = new EditorView({ state, parent: previewContainerRef.value })
}

function setEditorContent(content: string) {
  if (!editorView) return
  const current = editorView.state.doc.toString()
  if (current === content) return
  editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: content } })
}

function setPreviewContent(content: string) {
  if (!previewView) return
  const current = previewView.state.doc.toString()
  if (current === content) return
  previewView.dispatch({ changes: { from: 0, to: previewView.state.doc.length, insert: content } })
}

function setEditorMode(mode: EditorMode) {
  if (!editorView) return
  editorView.dispatch({ effects: modeCompartment.reconfigure(getLangExtension(mode)) })
}

function setEditorTheme(dark: boolean) {
  if (!editorView) return
  editorView.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) })
}

function formatEditorContent(): boolean {
  if (!editorView) return false
  const content = editorView.state.doc.toString()
  const mode = configForm.value.type as EditorMode || 'text'
  let formatted = content
  try {
    if (mode === 'json') {
      formatted = JSON.stringify(JSON.parse(content), null, 2)
    } else if (mode === 'yaml') {
      formatted = content.split('\n').map((l: string) => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n')
    }
  } catch { return false }
  if (formatted !== content) {
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: formatted } })
    return true
  }
  return false
}

function handleFormatContent() {
  const ok = formatEditorContent()
  if (ok) {
    ElMessage.success('格式化成功')
    editorError.value = ''
  } else {
    editorError.value = '格式化失败：内容格式不正确，无法解析'
    setTimeout(() => { editorError.value = '' }, 3000)
  }
}

function handleToggleTheme() {
  editorDark.value = !editorDark.value
  setEditorTheme(editorDark.value)
}

// 监听编辑器容器挂载，初始化编辑器
watch(editorContainerRef, (el) => {
  if (el && configDialogVisible.value) {
    nextTick(() => initEditor(configForm.value.content || '', (configForm.value.type as EditorMode) || 'yaml'))
  }
})

watch(previewContainerRef, (el) => {
  if (el && previewDialogVisible.value) {
    nextTick(() => initPreview(previewContent.value, (previewConfig.value?.type as EditorMode) || 'text'))
  }
})

// ==================== 类型定义 ====================
interface NacosConnection {
  id?: number; name: string; server_url: string; namespace?: string; username?: string; password?: string
}
interface NacosNamespace {
  namespace: string; namespaceShowName: string; quota: number; configCount: number
}
interface NacosConfig {
  dataId: string; group: string; content?: string; type?: string; appName?: string; desc?: string; lastModifiedTime?: number; md5?: string
}
interface HistoryItem {
  id: number; dataId: string; group: string; content?: string; opType: string; lastModifiedTime: number; operIp?: string
}

// ==================== 状态 ====================
const connections = ref<NacosConnection[]>([])
const activeConnection = ref<NacosConnection | null>(null)
const accessToken = ref('')
const loginStatus = ref<'none' | 'success' | 'fail'>('none')
const loginLoading = ref(false)
const connStatusMap = ref<Record<number, 'success' | 'fail' | 'none'>>({})

const namespaces = ref<NacosNamespace[]>([])
const selectedNamespace = ref('')

const configs = ref<NacosConfig[]>([])
const tableLoading = ref(false)
const searchDataId = ref('')
const searchGroup = ref('')
const pageNo = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)

// 登录对话框
const loginDialogVisible = ref(false)
const loginFormRef = ref()
const loginForm = ref({ username: 'nacos', password: 'nacos' })

// 连接对话框
const connectionDialogVisible = ref(false)
const isEditConn = ref(false)
const connectionFormRef = ref()
const connectionForm = ref<NacosConnection>({ name: '', server_url: 'http://localhost:8848', username: 'nacos', password: 'nacos' })
const connectionRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  server_url: [{ required: true, message: '请输入服务地址', trigger: 'blur' }]
}

// 配置对话框
const configDialogVisible = ref(false)
const isConfigEdit = ref(false)
const submitLoading = ref(false)
const configFormRef = ref()
const originalContent = ref('')  // 编辑前的原始内容（用于对比）
const configTabName = ref('edit')
const configForm = ref<NacosConfig>({ dataId: '', group: 'DEFAULT_GROUP', type: 'yaml', content: '', appName: '', desc: '' })
const configRules = {
  dataId: [{ required: true, message: '请输入 Data ID', trigger: 'blur' }],
  group: [{ required: true, message: '请输入 Group', trigger: 'blur' }]
}

// 快速预览对话框
const previewDialogVisible = ref(false)
const previewConfig = ref<NacosConfig | null>(null)
const previewContent = ref('')

// 历史对话框
const historyDialogVisible = ref(false)
const historyConfig = ref<NacosConfig | null>(null)
const historyList = ref<HistoryItem[]>([])
const historyLoading = ref(false)
const historyPageNo = ref(1)
const historyTotal = ref(0)
const historyPreview = ref('')
const historySelectedId = ref<number | null>(null)
const historyCompareItems = ref<HistoryItem[]>([])

// 导入预览对话框
const importPreviewDialogVisible = ref(false)
const importItems = ref<NacosConfig[]>([])
const importLoading = ref(false)

// ==================== 工具函数 ====================
function getBaseURL(): string {
  if (!activeConnection.value) return ''
  return activeConnection.value.server_url.replace(/\/$/, '')
}

function formatDate(ts: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

function getTypeTagType(type: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    yaml: 'success', json: 'warning', properties: '', xml: 'info'
  }
  return map[type] ?? 'info'
}

function getConnStatusClass(conn: NacosConnection): string {
  const s = connStatusMap.value[conn.id ?? 0]
  if (s === 'success') return 'dot-green'
  if (s === 'fail') return 'dot-red'
  return 'dot-gray'
}

// ==================== 连接管理 ====================
async function loadConnections() {
  connections.value = await window.api.connection.getAll()
}

function handleAddConnection() {
  isEditConn.value = false
  connectionForm.value = { name: '', server_url: 'http://localhost:8848', username: 'nacos', password: 'nacos' }
  connectionDialogVisible.value = true
}

function handleEditConnection(conn: NacosConnection) {
  isEditConn.value = true
  connectionForm.value = { ...conn }
  connectionDialogVisible.value = true
}

async function submitConnection() {
  if (!connectionFormRef.value) return
  try {
    await connectionFormRef.value.validate()
    if (isEditConn.value && connectionForm.value.id) {
      await window.api.connection.delete(connectionForm.value.id)
    }
    await window.api.connection.add({ ...connectionForm.value })
    ElMessage.success(isEditConn.value ? '连接已更新' : '连接已添加')
    connectionDialogVisible.value = false
    await loadConnections()
  } catch (e: any) {
    if (e?.message) ElMessage.error(e.message)
  }
}

async function handleDeleteConnection(conn: NacosConnection) {
  try {
    await ElMessageBox.confirm(`确定删除连接「${conn.name}」？`, '确认删除')
    await window.api.connection.delete(conn.id!)
    ElMessage.success('已删除')
    if (activeConnection.value?.id === conn.id) {
      activeConnection.value = null
      configs.value = []
    }
    await loadConnections()
  } catch {}
}

async function selectConnection(conn: NacosConnection) {
  if (activeConnection.value?.id === conn.id) return
  activeConnection.value = conn
  accessToken.value = ''
  loginStatus.value = 'none'
  namespaces.value = []
  selectedNamespace.value = ''
  configs.value = []
  pageNo.value = 1
  if (conn.username) await doLogin()
  await loadNamespaces()
  await loadConfigs()
}

// ==================== 登录鉴权 ====================
function openLoginDialog() {
  const conn = activeConnection.value
  loginForm.value = { username: conn?.username || 'nacos', password: conn?.password || 'nacos' }
  loginDialogVisible.value = true
}

async function submitLogin() {
  loginLoading.value = true
  try {
    const baseURL = getBaseURL()
    const res = await nacosPost(`${baseURL}/nacos/v1/auth/users/login`, { username: loginForm.value.username, password: loginForm.value.password })
    if (res?.accessToken) {
      accessToken.value = res.accessToken
      loginStatus.value = 'success'
      if (activeConnection.value?.id) connStatusMap.value[activeConnection.value.id] = 'success'
      loginDialogVisible.value = false
      ElMessage.success('登录成功')
      await loadNamespaces()
      await loadConfigs()
    } else {
      ElMessage.warning('登录未返回 token，请检查 Nacos 鉴权配置')
    }
  } catch (e: any) {
    if (e?.message === 'ERR_CONNECTION_REFUSED') {
      ElMessage.error('Nacos 未启动，请先启动 Nacos 服务')
      loginStatus.value = 'none'
    } else {
      ElMessage.error(`登录失败: ${e.message || '用户名或密码不正确'}`)
      loginStatus.value = 'fail'
      if (activeConnection.value?.id) connStatusMap.value[activeConnection.value.id] = 'fail'
    }
  } finally {
    loginLoading.value = false
  }
}

async function doLogin() {
  if (!activeConnection.value) return
  const conn = activeConnection.value
  if (!conn.username) { loginStatus.value = 'none'; return }
  loginLoading.value = true
  try {
    const baseURL = getBaseURL()
    const res = await nacosPost(`${baseURL}/nacos/v1/auth/users/login`, { username: conn.username || '', password: conn.password || '' })
    if (res?.accessToken) {
      accessToken.value = res.accessToken
      loginStatus.value = 'success'
      if (conn.id) connStatusMap.value[conn.id] = 'success'
    }
  } catch (e: any) {
    if (e?.message === 'ERR_CONNECTION_REFUSED') { loginStatus.value = 'none'; return }
    if (e?.message?.includes('403') || e?.message?.toLowerCase().includes('forbidden')) {
      loginStatus.value = 'fail'
      if (activeConnection.value?.id) connStatusMap.value[activeConnection.value.id] = 'fail'
    } else { loginStatus.value = 'none' }
  } finally {
    loginLoading.value = false
  }
}

// ==================== 命名空间 ====================
async function loadNamespaces() {
  try {
    const params: Record<string, any> = {}
    if (accessToken.value) params.accessToken = accessToken.value
    const res = await nacosGet(`${getBaseURL()}/nacos/v1/console/namespaces`, params)
    if (res?.data) namespaces.value = (res.data as NacosNamespace[]).filter(n => n.namespace !== '')
  } catch (e: any) {
    if (e?.message !== 'ERR_CONNECTION_REFUSED') console.warn('loadNamespaces error:', e?.message)
  }
}

async function handleNamespaceChange() {
  pageNo.value = 1
  await loadConfigs()
}

// ==================== 配置列表 ====================
async function loadConfigs() {
  if (!activeConnection.value) return
  tableLoading.value = true
  try {
    const params: Record<string, any> = { search: 'blur', pageNo: pageNo.value, pageSize: pageSize.value }
    if (searchDataId.value) params.dataId = searchDataId.value
    else params.dataId = ''
    if (searchGroup.value) params.group = searchGroup.value
    else params.group = ''
    if (selectedNamespace.value) params.tenant = selectedNamespace.value
    if (accessToken.value) params.accessToken = accessToken.value
    const res = await nacosGet(`${getBaseURL()}/nacos/v1/cs/configs`, params)
    if (res?.pageItems) {
      configs.value = res.pageItems
      totalCount.value = res.totalCount || 0
    } else { configs.value = []; totalCount.value = 0 }
  } catch (e: any) {
    const msg: string = e?.message || ''
    if (msg === 'ERR_CONNECTION_REFUSED') return
    const isAuthError = msg.toLowerCase().includes('user not found') || msg.includes('403') || msg.toLowerCase().includes('forbidden') || msg.includes('401') || msg.toLowerCase().includes('unauthorized')
    if (isAuthError) { loginStatus.value = loginStatus.value === 'success' ? 'fail' : loginStatus.value }
    else ElMessage.error(`加载失败: ${msg}`)
  } finally {
    tableLoading.value = false
  }
}

// ==================== 配置 CRUD ====================
function handleCreateConfig() {
  isConfigEdit.value = false
  originalContent.value = ''
  configForm.value = { dataId: '', group: 'DEFAULT_GROUP', type: 'yaml', content: '', appName: '', desc: '' }
  configTabName.value = 'edit'
  configDialogVisible.value = true
  nextTick(() => initEditor('', 'yaml'))
}

async function handleEditConfig(config: NacosConfig) {
  isConfigEdit.value = true
  originalContent.value = ''
  configForm.value = { ...config, content: '' }
  configTabName.value = 'edit'
  configDialogVisible.value = true
  nextTick(() => initEditor('', (config.type as EditorMode) || 'yaml'))
  // 异步加载原始内容
  try {
    const params: Record<string, any> = { dataId: config.dataId, group: config.group }
    if (selectedNamespace.value) params.tenant = selectedNamespace.value
    if (accessToken.value) params.accessToken = accessToken.value
    const res = await nacosGet(`${getBaseURL()}/nacos/v1/cs/configs`, params)
    const rawContent = typeof res === 'string' ? res : JSON.stringify(res, null, 2)
    originalContent.value = rawContent
    configForm.value.content = rawContent
    setEditorContent(rawContent)
  } catch (e: any) {
    ElMessage.warning(`加载内容失败: ${e.message}`)
    originalContent.value = config.content || ''
  }
}

async function submitConfig() {
  if (!configFormRef.value) return
  submitLoading.value = true
  try {
    await configFormRef.value.validate()
    const formData: Record<string, string> = {
      dataId: configForm.value.dataId,
      group: configForm.value.group,
      content: configForm.value.content || '',
      type: configForm.value.type || 'text'
    }
    if (configForm.value.appName) formData.appName = configForm.value.appName
    if (configForm.value.desc) formData.desc = configForm.value.desc
    if (selectedNamespace.value) formData.tenant = selectedNamespace.value
    if (accessToken.value) formData.accessToken = accessToken.value
    await nacosPost(`${getBaseURL()}/nacos/v1/cs/configs`, formData)
    ElMessage.success('配置已发布')
    configDialogVisible.value = false
    await loadConfigs()
  } catch (e: any) {
    ElMessage.error(`发布失败: ${e.message}`)
  } finally {
    submitLoading.value = false
  }
}

async function handleDeleteConfig(config: NacosConfig) {
  try {
    await ElMessageBox.confirm(`确定删除配置「${config.dataId}」？此操作不可撤销`, '确认删除', { type: 'warning' })
    const params: Record<string, any> = { dataId: config.dataId, group: config.group }
    if (selectedNamespace.value) params.tenant = selectedNamespace.value
    if (accessToken.value) params.accessToken = accessToken.value
    await nacosDelete(`${getBaseURL()}/nacos/v1/cs/configs`, params)
    ElMessage.success('已删除')
    await loadConfigs()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(`删除失败: ${e.message}`)
  }
}

// ==================== 快速预览 ====================
async function handleRowDoubleClick(row: NacosConfig) {
  handleQuickView(row)
}

async function handleQuickView(config: NacosConfig) {
  previewConfig.value = config
  previewContent.value = ''
  previewDialogVisible.value = true
  nextTick(() => initPreview('', (config.type as EditorMode) || 'text'))
  try {
    const params: Record<string, any> = { dataId: config.dataId, group: config.group }
    if (selectedNamespace.value) params.tenant = selectedNamespace.value
    if (accessToken.value) params.accessToken = accessToken.value
    const res = await nacosGet(`${getBaseURL()}/nacos/v1/cs/configs`, params)
    previewContent.value = typeof res === 'string' ? res : JSON.stringify(res, null, 2)
    setPreviewContent(previewContent.value)
  } catch {
    previewContent.value = config.content || '（无法加载内容）'
    setPreviewContent(previewContent.value)
  }
}

function handleEditFromPreview() {
  if (!previewConfig.value) return
  previewDialogVisible.value = false
  nextTick(() => handleEditConfig(previewConfig.value!))
}

// ==================== 历史版本 ====================
async function handleViewHistory(config: NacosConfig) {
  historyConfig.value = config
  historyPageNo.value = 1
  historyPreview.value = ''
  historySelectedId.value = null
  historyCompareItems.value = []
  historyDialogVisible.value = true
  await loadHistory()
}

async function loadHistory() {
  if (!historyConfig.value) return
  historyLoading.value = true
  try {
    const params: Record<string, any> = {
      search: 'accurate', dataId: historyConfig.value.dataId, group: historyConfig.value.group,
      pageNo: historyPageNo.value, pageSize: 20
    }
    if (selectedNamespace.value) params.tenant = selectedNamespace.value
    if (accessToken.value) params.accessToken = accessToken.value
    const res = await nacosGet(`${getBaseURL()}/nacos/v1/cs/history`, params)
    if (res?.pageItems) {
      historyList.value = res.pageItems
      historyTotal.value = res.totalCount || 0
    } else { historyList.value = []; historyTotal.value = 0 }
  } catch (e: any) {
    ElMessage.error(`加载历史失败: ${e.message}`)
  } finally {
    historyLoading.value = false
  }
}

function handleHistorySelection(rows: HistoryItem[]) {
  // 最多保留两条，取最新的
  if (rows.length > 2) {
    rows = rows.slice(-2)
  }
  historyCompareItems.value = rows
}

async function previewHistory(item: HistoryItem) {
  try {
    const params: Record<string, any> = { nid: item.id }
    if (accessToken.value) params.accessToken = accessToken.value
    const res = await nacosGet(`${getBaseURL()}/nacos/v1/cs/history`, params)
    historyPreview.value = res?.content || JSON.stringify(res, null, 2)
  } catch {
    historyPreview.value = item.content || '（无法获取内容）'
  }
}

async function rollbackHistory(item: HistoryItem) {
  if (!historyConfig.value) return
  try {
    await ElMessageBox.confirm(`确定回滚到版本 ID=${item.id}？当前配置将被覆盖`, '确认回滚', { type: 'warning' })
    const formData: Record<string, string> = {
      dataId: historyConfig.value.dataId, group: historyConfig.value.group, id: String(item.id)
    }
    if (selectedNamespace.value) formData.tenant = selectedNamespace.value
    if (accessToken.value) formData.accessToken = accessToken.value
    await nacosPost(`${getBaseURL()}/nacos/v1/cs/history/rollback`, formData)
    ElMessage.success('回滚成功')
    historyDialogVisible.value = false
    await loadConfigs()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(`回滚失败: ${e.message}`)
  }
}

// ==================== 导入/导出 ====================
async function handleExport() {
  if (!activeConnection.value) return
  tableLoading.value = true
  try {
    const allConfigs: NacosConfig[] = []
    let page = 1
    while (true) {
      const params: Record<string, any> = { search: 'blur', dataId: '', group: '', pageNo: page, pageSize: 100 }
      if (selectedNamespace.value) params.tenant = selectedNamespace.value
      if (accessToken.value) params.accessToken = accessToken.value
      const res = await nacosGet(`${getBaseURL()}/nacos/v1/cs/configs`, params)
      const items: NacosConfig[] = res?.pageItems || []
      for (const item of items) {
        const cparams: Record<string, any> = { dataId: item.dataId, group: item.group }
        if (selectedNamespace.value) cparams.tenant = selectedNamespace.value
        if (accessToken.value) cparams.accessToken = accessToken.value
        const cres = await nacosGet(`${getBaseURL()}/nacos/v1/cs/configs`, cparams)
        allConfigs.push({ ...item, content: typeof cres === 'string' ? cres : JSON.stringify(cres) })
      }
      if (items.length < 100) break
      page++
    }
    const exportData = {
      exportTime: new Date().toISOString(),
      connection: activeConnection.value.name,
      namespace: selectedNamespace.value || 'public',
      total: allConfigs.length,
      configs: allConfigs
    }
    const date = new Date().toISOString().slice(0, 10)
    await window.api.dialog.saveFile({
      title: '导出 Nacos 配置',
      defaultPath: `nacos-configs-${date}.json`,
      content: JSON.stringify(exportData, null, 2)
    })
    ElMessage.success(`已导出 ${allConfigs.length} 条配置`)
  } catch (e: any) {
    ElMessage.error(`导出失败: ${e.message}`)
  } finally {
    tableLoading.value = false
  }
}

async function handleImport() {
  try {
    const result = await window.api.dialog.openFile({ title: '选择配置文件', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!result) return
    const data = JSON.parse(result.content)
    const items: NacosConfig[] = data.configs || data
    if (!Array.isArray(items) || items.length === 0) {
      ElMessage.warning('文件内容格式不正确或为空')
      return
    }
    importItems.value = items
    importPreviewDialogVisible.value = true
  } catch (e: any) {
    ElMessage.error(`读取文件失败: ${e.message}`)
  }
}

async function confirmImport() {
  importLoading.value = true
  let success = 0; let fail = 0
  try {
    for (const item of importItems.value) {
      try {
        const formData: Record<string, string> = {
          dataId: item.dataId, group: item.group, content: item.content || '', type: item.type || 'text'
        }
        if (selectedNamespace.value) formData.tenant = selectedNamespace.value
        if (accessToken.value) formData.accessToken = accessToken.value
        await nacosPost(`${getBaseURL()}/nacos/v1/cs/configs`, formData)
        success++
      } catch { fail++ }
    }
    ElMessage.success(`导入完成：成功 ${success} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`)
    importPreviewDialogVisible.value = false
    await loadConfigs()
  } finally {
    importLoading.value = false
  }
}

onMounted(() => { loadConnections() })
</script>

<style scoped>
.config-view { display: flex; height: calc(100vh - 60px); gap: 0; overflow: hidden; }

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
.conn-more { color: #c0c4cc; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
.connection-item:hover .conn-more { opacity: 1; }
.refresh-btn { padding: 8px; border-top: 1px solid #e4e7ed; text-align: center; }

/* ===== 登录横幅 ===== */
.login-banner { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; gap: 12px; }
.banner-fail { background: #fef0f0; border: 1px solid #fbc4c4; }
.banner-none { background: #f4f4f5; border: 1px solid #d3d4d6; }
.banner-content { display: flex; align-items: center; gap: 8px; }
.banner-icon { font-size: 16px; flex-shrink: 0; }
.banner-fail .banner-icon { color: #f56c6c; }
.banner-none .banner-icon { color: #909399; }
.banner-text { font-size: 13px; color: #606266; }
.banner-fail .banner-text { color: #c45656; }

/* ===== 右侧面板 ===== */
.right-panel { flex: 1; display: flex; flex-direction: column; padding: 20px; overflow: hidden; }
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.toolbar-left { display: flex; align-items: center; gap: 8px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; }
.active-conn-name { font-weight: 600; font-size: 14px; color: #303133; }
.pagination { display: flex; justify-content: flex-end; padding: 12px 0 0; }

/* ===== 代码编辑器 ===== */
.editor-form-item { margin-bottom: 0; }
.editor-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.editor-mode-label { font-size: 12px; color: #909399; }
.editor-wrapper { border: 1px solid #dcdfe6; border-radius: 4px; height: 380px; transition: border-color 0.2s; }
.editor-wrapper:focus-within { border-color: #409eff; }
.editor-dark { border-color: #4a4a5a; }
.editor-container { height: 380px; overflow: hidden; }
.editor-dark .editor-container { background: #282c34; }
.editor-error { font-size: 12px; color: #f56c6c; margin-top: 4px; }

/* ===== 对比视图 ===== */
.diff-container { display: flex; flex-direction: column; gap: 8px; }
.diff-header { display: flex; flex-direction: column; gap: 2px; }
.diff-title { font-weight: 600; font-size: 14px; color: #303133; }
.diff-subtitle { font-size: 12px; color: #909399; }
.diff-body { display: flex; gap: 0; height: 360px; border: 1px solid #e4e7ed; border-radius: 4px; overflow: hidden; }
.diff-old, .diff-new { flex: 1; overflow: auto; padding: 0; }
.diff-divider { width: 1px; background: #e4e7ed; }
.diff-pane-title { padding: 8px 12px; background: #f5f7fa; border-bottom: 1px solid #e4e7ed; font-size: 12px; font-weight: 600; color: #606266; }
.diff-content { margin: 0; padding: 10px 12px; font-size: 12px; line-height: 1.6; font-family: "Fira Code", "Consolas", monospace; white-space: pre-wrap; word-break: break-all; min-height: 300px; color: #303133; }
.diff-summary { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.diff-changed { color: #e6a23c; display: flex; align-items: center; gap: 4px; }
.diff-unchanged { color: #67c23a; display: flex; align-items: center; gap: 4px; }

/* ===== 预览视图 ===== */
.preview-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.preview-last-modified { font-size: 12px; color: #909399; margin-left: auto; }
.preview-wrapper { border: 1px solid #dcdfe6; border-radius: 4px; height: 480px; overflow: hidden; transition: border-color 0.2s; }
.preview-dark { border-color: #4a4a5a; }
.preview-editor { height: 480px; overflow: auto; }
.preview-dark .preview-editor { background: #282c34; }

/* ===== 历史对比 ===== */
.history-compare { margin-top: 10px; border: 1px solid #e6a23c; border-radius: 6px; overflow: hidden; }
.compare-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fdf6ec; border-bottom: 1px solid #f5e1c8; font-size: 13px; color: #e6a23c; }
.compare-body { display: flex; height: 280px; }
.compare-old, .compare-new { flex: 1; overflow: auto; }
.compare-divider { width: 1px; background: #f5e1c8; }
.compare-title { padding: 6px 10px; background: #fdf6ec; border-bottom: 1px solid #f5e1c8; font-size: 12px; font-weight: 600; color: #e6a23c; position: sticky; top: 0; }
.compare-content { margin: 0; padding: 8px 10px; font-size: 12px; line-height: 1.6; font-family: "Fira Code", "Consolas", monospace; white-space: pre-wrap; word-break: break-all; }

/* ===== 历史预览 ===== */
.history-preview { margin-top: 10px; border: 1px solid #e4e7ed; border-radius: 6px; overflow: hidden; }
.history-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.history-title { font-weight: 600; font-size: 14px; color: #303133; }
.history-pagination { display: flex; justify-content: flex-end; padding: 10px 0; }
.preview-title { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f5f7fa; border-bottom: 1px solid #e4e7ed; font-size: 12px; font-weight: 600; color: #606266; }
.preview-content { margin: 0; padding: 10px 12px; font-size: 12px; line-height: 1.6; font-family: "Fira Code", "Consolas", monospace; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow: auto; }

/* ===== 导入预览 ===== */
.import-summary { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #ecf5ff; border: 1px solid #b3d8ff; border-radius: 6px; font-size: 13px; color: #409eff; margin-bottom: 12px; }

/* ===== 弹窗底部 ===== */
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
