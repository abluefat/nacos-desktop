import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import log from 'electron-log'
import Store from 'electron-store'

const store = new Store({
  name: 'settings',
  defaults: {
    versionsPath: '',  // 用户自定义版本目录，为空则使用默认
    downloadPath: ''    // 用户自定义下载目录，为空则使用默认
  }
})

let db: SqlJsDatabase | null = null
let dbPath: string = ''

// 获取数据目录
function getDataPath(): string {
  const dataPath = join(app.getPath('userData'), 'data')
  if (!existsSync(dataPath)) {
    mkdirSync(dataPath, { recursive: true })
  }
  return dataPath
}

// 获取版本目录（支持自定义）
export function getVersionsPath(): string {
  const customPath = store.get('versionsPath') as string
  const versionsPath = customPath || join(getDataPath(), 'versions')
  if (!existsSync(versionsPath)) {
    mkdirSync(versionsPath, { recursive: true })
  }
  return versionsPath
}

// 获取实例目录
export function getInstancesPath(): string {
  const instancesPath = join(getDataPath(), 'instances')
  if (!existsSync(instancesPath)) {
    mkdirSync(instancesPath, { recursive: true })
  }
  return instancesPath
}

// 获取下载目录（支持自定义）
export function getDownloadPath(): string {
  const customPath = store.get('downloadPath') as string
  const downloadPath = customPath || join(app.getPath('downloads'), 'nacos-desktop-downloads')
  if (!existsSync(downloadPath)) {
    mkdirSync(downloadPath, { recursive: true })
  }
  return downloadPath
}

// 设置/获取自定义目录
export function setVersionsPath(path: string): void {
  store.set('versionsPath', path)
  if (path && !existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export function setDownloadPath(path: string): void {
  store.set('downloadPath', path)
  if (path && !existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export function getSettings(): { versionsPath: string; downloadPath: string; defaultVersionsPath: string } {
  const defaultVersionsPath = join(getDataPath(), 'versions')
  return {
    versionsPath: store.get('versionsPath') as string || '',
    downloadPath: store.get('downloadPath') as string || '',
    defaultVersionsPath
  }
}

// 保存数据库到文件
function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(dbPath, buffer)
    log.info('Database saved to:', dbPath)
  }
}

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<void> {
  dbPath = join(getDataPath(), 'app.db')
  log.info('Database path:', dbPath)

  const SQL = await initSqlJs()

  // 如果数据库文件存在，加载它
  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
    log.info('Database loaded from file')
  } else {
    db = new SQL.Database()
    log.info('New database created')
  }

  // 创建表
  createTables()
}

// 创建数据库表
function createTables(): void {
  if (!db) return

  // Nacos 版本表
  db.run(`
    CREATE TABLE IF NOT EXISTS nacos_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      install_path TEXT NOT NULL,
      size INTEGER,
      downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Nacos 实例表
  db.run(`
    CREATE TABLE IF NOT EXISTS nacos_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      version TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('standalone', 'cluster')),
      port INTEGER NOT NULL DEFAULT 8848,
      work_dir TEXT NOT NULL,
      jvm_xms TEXT DEFAULT '512m',
      jvm_xmx TEXT DEFAULT '512m',
      cluster_nodes TEXT,
      mysql_config TEXT,
      pid INTEGER,
      status TEXT DEFAULT 'stopped',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Nacos 连接表
  db.run(`
    CREATE TABLE IF NOT EXISTS nacos_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      server_url TEXT NOT NULL,
      namespace TEXT DEFAULT 'public',
      username TEXT,
      password TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  saveDatabase()
  log.info('Database tables created successfully')
}

/**
 * 获取数据库实例
 */
export function getDatabase(): SqlJsDatabase | null {
  return db
}

// ==================== 版本管理 CRUD ====================

export interface NacosVersion {
  id?: number
  version: string
  install_path: string
  size?: number
  downloaded_at?: string
}

export function getAllVersions(): NacosVersion[] {
  if (!db) return []
  const results = db.exec('SELECT * FROM nacos_versions ORDER BY downloaded_at DESC')
  if (results.length === 0) return []
  // 确保返回纯 JSON 对象（避免 sql.js 内部属性导致 IPC 序列化失败）
  return results[0].values.map(row => JSON.parse(JSON.stringify({
    id: row[0] as number,
    version: row[1] as string,
    install_path: row[2] as string,
    size: row[3] as number,
    downloaded_at: row[4] as string
  })))
}

export function addVersion(version: NacosVersion): NacosVersion {
  if (!db) throw new Error('Database not initialized')
  db.run(
    'INSERT INTO nacos_versions (version, install_path, size) VALUES (?, ?, ?)',
    [version.version, version.install_path, version.size || 0]
  )
  const results = db.exec('SELECT last_insert_rowid()')
  const id = results[0].values[0][0] as number
  saveDatabase()
  // 确保返回纯 JSON 对象
  return JSON.parse(JSON.stringify({ ...version, id }))
}

export function deleteVersion(id: number): void {
  if (!db) throw new Error('Database not initialized')
  db.run('DELETE FROM nacos_versions WHERE id = ?', [id])
  saveDatabase()
}

// ==================== 实例管理 CRUD ====================

export interface NacosInstance {
  id?: number
  name: string
  version: string
  mode: 'standalone' | 'cluster'
  port: number
  work_dir: string
  jvm_xms?: string
  jvm_xmx?: string
  cluster_nodes?: string
  mysql_config?: string
  pid?: number
  status?: string
  created_at?: string
  updated_at?: string
}

function rowToInstance(row: any[]): NacosInstance {
  return {
    id: row[0] as number,
    name: row[1] as string,
    version: row[2] as string,
    mode: row[3] as 'standalone' | 'cluster',
    port: row[4] as number,
    work_dir: row[5] as string,
    jvm_xms: row[6] as string,
    jvm_xmx: row[7] as string,
    cluster_nodes: row[8] as string,
    mysql_config: row[9] as string,
    pid: row[10] as number,
    status: row[11] as string,
    created_at: row[12] as string,
    updated_at: row[13] as string
  }
}

export function getAllInstances(): NacosInstance[] {
  if (!db) return []
  const results = db.exec('SELECT * FROM nacos_instances ORDER BY created_at DESC')
  if (results.length === 0) return []
  return results[0].values.map(row => JSON.parse(JSON.stringify(rowToInstance(row))))
}

export function getInstanceById(id: number): NacosInstance | undefined {
  if (!db) return undefined
  const results = db.exec('SELECT * FROM nacos_instances WHERE id = ?', [id])
  if (results.length === 0 || results[0].values.length === 0) return undefined
  return JSON.parse(JSON.stringify(rowToInstance(results[0].values[0])))
}

export function addInstance(instance: NacosInstance): NacosInstance {
  if (!db) throw new Error('Database not initialized')
  db.run(
    `INSERT INTO nacos_instances (name, version, mode, port, work_dir, jvm_xms, jvm_xmx, cluster_nodes, mysql_config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      instance.name,
      instance.version,
      instance.mode,
      instance.port,
      instance.work_dir,
      instance.jvm_xms || '512m',
      instance.jvm_xmx || '512m',
      instance.cluster_nodes || null,
      instance.mysql_config || null
    ]
  )
  const results = db.exec('SELECT last_insert_rowid()')
  const id = results[0].values[0][0] as number
  saveDatabase()
  return JSON.parse(JSON.stringify({ ...instance, id }))
}

export function updateInstance(id: number, updates: Partial<NacosInstance>): void {
  if (!db) throw new Error('Database not initialized')
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at')
  if (fields.length === 0) return

  const setClause = fields.map(f => `${f} = ?`).join(', ')
  const values = fields.map(f => (updates as any)[f])
  
  db.run(`UPDATE nacos_instances SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id])
  saveDatabase()
}

export function deleteInstance(id: number): void {
  if (!db) throw new Error('Database not initialized')
  db.run('DELETE FROM nacos_instances WHERE id = ?', [id])
  saveDatabase()
}

// ==================== 连接管理 CRUD ====================

export interface NacosConnection {
  id?: number
  name: string
  server_url: string
  namespace?: string
  username?: string
  password?: string
  created_at?: string
}

function rowToConnection(row: any[]): NacosConnection {
  return {
    id: row[0] as number,
    name: row[1] as string,
    server_url: row[2] as string,
    namespace: row[3] as string,
    username: row[4] as string,
    password: row[5] as string,
    created_at: row[6] as string
  }
}

export function getAllConnections(): NacosConnection[] {
  if (!db) return []
  const results = db.exec('SELECT * FROM nacos_connections ORDER BY created_at DESC')
  if (results.length === 0) return []
  return results[0].values.map(row => JSON.parse(JSON.stringify(rowToConnection(row))))
}

export function addConnection(connection: NacosConnection): NacosConnection {
  if (!db) throw new Error('Database not initialized')
  db.run(
    'INSERT INTO nacos_connections (name, server_url, namespace, username, password) VALUES (?, ?, ?, ?, ?)',
    [
      connection.name,
      connection.server_url,
      connection.namespace || 'public',
      connection.username || null,
      connection.password || null
    ]
  )
  const results = db.exec('SELECT last_insert_rowid()')
  const id = results[0].values[0][0] as number
  saveDatabase()
  return JSON.parse(JSON.stringify({ ...connection, id }))
}

export function deleteConnection(id: number): void {
  if (!db) throw new Error('Database not initialized')
  db.run('DELETE FROM nacos_connections WHERE id = ?', [id])
  saveDatabase()
}

// ==================== 启动清扫 ====================

/**
 * 应用启动时重置所有残留的 starting/running 状态为 stopped
 * （上次运行时进程可能异常退出，数据库中留有脏状态）
 */
export function resetStaleInstances(): void {
  if (!db) return
  const result = db.run(
    `UPDATE nacos_instances SET status = 'stopped', pid = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE status IN ('starting', 'running')`
  )
  saveDatabase()
  log.info('[DB] Stale instances reset: status -> stopped')
}
