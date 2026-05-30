import { ipcMain, shell, app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from 'fs'
import { exec, execSync, spawn, ChildProcess } from 'child_process'
import * as https from 'https'
import * as http from 'http'
import { platform } from 'os'
import log from 'electron-log'
import * as db from './database'
import { promisify } from 'util'

// 将 child_process.exec 包装为 Promise，供 async/await 使用
const execAsync = promisify(exec)

/**
 * 解压 zip 或 tar.gz 压缩包
 */
async function extractArchive(archivePath: string, targetDir: string, version: string, event: any): Promise<void> {
  const ext = archivePath.toLowerCase()

  return new Promise((resolve, reject) => {
    if (ext.endsWith('.zip')) {
      // Windows: 使用 Expand-Archive
      const cmd = `powershell -Command "Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force"`
      log.info(`Extracting (Windows): ${cmd}`)
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          log.error('PowerShell extract error:', stderr)
          reject(new Error(`解压失败: ${stderr || error.message}`))
        } else {
          log.info(`Extract success: ${archivePath}`)
          // 移动解压后的 nacos 目录到目标位置
          try {
            moveExtractedFolder(targetDir, version)
            resolve()
          } catch (err: any) {
            reject(err)
          }
        }
      })
    } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
      // macOS/Linux: 使用 tar
      const cmd = `tar -xzf "${archivePath}" -C "${targetDir}"`
      log.info(`Extracting (Unix): ${cmd}`)
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          log.error('tar extract error:', stderr)
          reject(new Error(`解压失败: ${stderr || error.message}`))
        } else {
          log.info(`Extract success: ${archivePath}`)
          try {
            moveExtractedFolder(targetDir, version)
            resolve()
          } catch (err: any) {
            reject(err)
          }
        }
      })
    } else {
      reject(new Error('不支持的压缩格式'))
    }
  })
}

/**
 * 将解压后的 nacos-server-x.x.x 目录重命名为 nacos
 * GitHub 发布的压缩包内部通常有一个 nacos-server-x.x.x 子目录
 */
function moveExtractedFolder(baseDir: string, version: string): void {
  try {
    const entries = readdirSync(baseDir, { withFileTypes: true })
    const subDirs = entries.filter(e => e.isDirectory())

    // 查找 nacos 目录（如 nacos-server-2.3.2）
    const nacosDir = subDirs.find(d => d.name.includes('nacos'))

    if (nacosDir) {
      const srcPath = join(baseDir, nacosDir.name)
      const destPath = join(baseDir, 'nacos')

      log.info(`[Extract] Found: ${nacosDir.name}, baseDir: ${baseDir}`)
      log.info(`[Extract] srcPath: ${srcPath}, destPath: ${destPath}`)

      // 如果已经是 nacos（无需移动）
      if (nacosDir.name === 'nacos') {
        log.info('[Extract] Already named nacos, skip moving')
        return
      }

      // 如果目标已存在，先删除
      if (existsSync(destPath)) {
        rmSync(destPath, { recursive: true, force: true })
      }

      // 重命名为 nacos
      renameSync(srcPath, destPath)
      log.info(`[Extract] Renamed ${nacosDir.name} -> nacos`)
    } else {
      // 检查 bin 目录是否直接在 baseDir 下（解压后内容直接在目标目录）
      const binPath = join(baseDir, 'bin')
      if (existsSync(binPath)) {
        log.info(`[Extract] bin/ exists in baseDir directly, no need to move`)
        return
      }

      log.warn(`[Extract] No nacos dir and no bin/ in ${baseDir}`)
      log.warn(`[Extract] Entries: ${entries.map(e => e.name).join(', ')}`)
      throw new Error('解压后未找到 nacos 目录，压缩包可能损坏')
    }
  } catch (error) {
    log.error('moveExtractedFolder error:', error)
    throw error  // 重新抛出，让调用者知道失败了
  }
}

// 存储运行中的进程
const runningProcesses: Map<number, ChildProcess> = new Map()

/**
 * 设置所有 IPC 处理器
 */
export function setupIpcHandlers(): void {
  // ==================== 窗口控制 ====================
  ipcMain.handle('app:get-path', (_, name: string) => app.getPath(name as any))
  ipcMain.handle('app:get-version', () => app.getVersion())

  // ==================== 版本管理 ====================
  ipcMain.handle('version:get-local', () => {
    try {
      return db.getAllVersions()
    } catch (error) {
      log.error('Failed to get local versions:', error)
      throw error
    }
  })

  ipcMain.handle('version:add', (_, version: db.NacosVersion) => {
    try {
      return db.addVersion(version)
    } catch (error) {
      log.error('Failed to add version:', error)
      throw error
    }
  })

  ipcMain.handle('version:delete', (_, id: number) => {
    try {
      db.deleteVersion(id)
      return true
    } catch (error) {
      log.error('Failed to delete version:', error)
      throw error
    }
  })

  ipcMain.handle('version:get-versions-path', () => db.getVersionsPath())

  // ==================== 设置管理 ====================
  ipcMain.handle('settings:get', () => db.getSettings())

  ipcMain.handle('settings:set-versions-path', (_, path: string) => {
    db.setVersionsPath(path)
    return { success: true }
  })

  ipcMain.handle('settings:set-download-path', (_, path: string) => {
    db.setDownloadPath(path)
    return { success: true }
  })

  // ==================== 版本管理（批量操作） ====================
  ipcMain.handle('version:batch-delete', async (_, ids: number[]) => {
    try {
      const versions = db.getAllVersions()
      const versionsMap = new Map(versions.map(v => [v.id, v]))

      const results: { id: number; success: boolean; error?: string }[] = []

      for (const id of ids) {
        try {
          const version = versionsMap.get(id)
          if (!version) {
            results.push({ id, success: false, error: 'Version not found' })
            continue
          }

          // 从数据库删除
          db.deleteVersion(id)

          // 从磁盘删除文件
          if (version.install_path && existsSync(version.install_path)) {
            rmSync(version.install_path, { recursive: true, force: true })
            log.info(`Deleted version files: ${version.install_path}`)
          }

          results.push({ id, success: true })
        } catch (error: any) {
          log.error(`Failed to delete version ${id}:`, error)
          results.push({ id, success: false, error: error.message })
        }
      }

      return results
    } catch (error: any) {
      log.error('Batch delete failed:', error)
      throw new Error(`批量删除失败: ${error.message}`)
    }
  })

  // ==================== 实例管理 ====================
  ipcMain.handle('instance:get-all', () => {
    try {
      return db.getAllInstances()
    } catch (error) {
      log.error('Failed to get instances:', error)
      throw error
    }
  })

  ipcMain.handle('instance:get-by-id', (_, id: number) => {
    try {
      return db.getInstanceById(id)
    } catch (error) {
      log.error('Failed to get instance:', error)
      throw error
    }
  })

  ipcMain.handle('instance:create', (_, instance: db.NacosInstance) => {
    try {
      // 验证必填字段
      if (!instance.name || !instance.version || !instance.port) {
        throw new Error('实例名称、版本和端口不能为空')
      }

      // 集群模式必须有工作目录
      if (instance.mode === 'cluster' && !instance.work_dir) {
        throw new Error('集群模式必须填写工作目录（指向 Nacos 安装目录）')
      }

      // 创建实例工作目录（仅在提供了路径时创建）
      if (instance.work_dir && !existsSync(instance.work_dir)) {
        mkdirSync(instance.work_dir, { recursive: true })
      }

      // 如果是集群模式，写入 cluster.conf
      if (instance.mode === 'cluster' && instance.cluster_nodes) {
        const clusterConfPath = join(instance.work_dir, 'conf', 'cluster.conf')
        writeFileSync(clusterConfPath, instance.cluster_nodes, 'utf-8')
        log.info('cluster.conf written to:', clusterConfPath)
      }

      // 如果是集群模式，写入 MySQL 配置到 application.properties
      if (instance.mode === 'cluster' && instance.mysql_config && instance.mysql_config.trim()) {
        const mysqlConfig = JSON.parse(instance.mysql_config)
        const propsPath = join(instance.work_dir, 'conf', 'application.properties')
        const mysqlProps = `
# MySQL Configuration
db.num=${mysqlConfig.db_num || 1}
db.url.0=jdbc:mysql://${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}?characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true
db.user.0=${mysqlConfig.username}
db.password.0=${mysqlConfig.password}
`
        if (existsSync(propsPath)) {
          const existingProps = readFileSync(propsPath, 'utf-8')
          writeFileSync(propsPath, existingProps + mysqlProps, 'utf-8')
        }
      }

      return db.addInstance(instance)
    } catch (error) {
      log.error('Failed to create instance:', error)
      throw error
    }
  })

  ipcMain.handle('instance:update', (_, id: number, updates: Partial<db.NacosInstance>) => {
    try {
      db.updateInstance(id, updates)
      return true
    } catch (error) {
      log.error('Failed to update instance:', error)
      throw error
    }
  })

  ipcMain.handle('instance:delete', (_, id: number) => {
    try {
      db.deleteInstance(id)
      // 同步删除关联的本地连接
      try {
        db.deleteConnectionsByInstanceId(id)
      } catch (e: any) {
        log.warn('[Instance] Failed to delete associated connections:', e.message)
      }
      return true
    } catch (error) {
      log.error('Failed to delete instance:', error)
      throw error
    }
  })

  ipcMain.handle('instance:get-instances-path', () => db.getInstancesPath())

  // ==================== 进程管理 ====================

  /**
   * 验证 Java 环境是否正常，在启动前给出明确的错误提示
   * 策略：1. JAVA_HOME 直接试；2. 快捷方式(.lnk)用 PowerShell 解析；3. 用 where.exe 从 PATH 找
   */
  /**
   * 从 java -version 输出解析 Java major version（如 8, 11, 17, 21）
   * 支持格式："1.8.0_xxx", "11.0.x", "17.0.x", "21.0.x" 等
   */
  function parseJavaMajorVersion(versionOutput: string): number | null {
    // 匹配 "1.8.0" 或 "11.0.x" 等格式
    const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/i)
    if (!match) return null
    const major = parseInt(match[1], 10)
    if (isNaN(major)) return null
    // Java 8 及以前：version "1.8.0_xxx" → major=1, second=8
    if (major === 1 && match[2]) {
      const second = parseInt(match[2], 10)
      if (!isNaN(second)) return second
    }
    // Java 9+: version "11.0.x" → major=11
    return major
  }

  /**
   * 根据 Nacos 版本号获取最低 JDK 要求
   * - Nacos 1.x: JDK 8
   * - Nacos 2.x（全系列 2.0 ~ 2.x）: JDK 8
   * - Nacos 3.0+: JDK 17
   * 参考：https://nacos.io/docs/v2.5/quickstart/quick-start/
   *       https://nacos.io/docs/v3.0/quickstart/quick-start/
   */
  function getMinJdkForNacos(nacosVersion: string): number {
    const ver = nacosVersion.replace(/^v/i, '').trim()
    const parts = ver.split('.')
    if (parts.length < 1) return 8
    const major = parseInt(parts[0], 10)
    if (isNaN(major)) return 8
    if (major === 1) return 8
    if (major === 2) return 8  // 2.x 全系列支持 JDK 8
    // Nacos 3.x+: JDK 17
    return 17
  }

  async function verifyJavaEnvironment(): Promise<{ ok: boolean; javaHome?: string; javaVersion?: number; error?: string; hint?: string }> {
      // 策略1：直接试 JAVA_HOME
    let javaHome = process.env.JAVA_HOME
    log.info("[JavaCheck] JAVA_HOME", javaHome);
    if (javaHome) {
      // Windows：解析快捷方式（.lnk）或目录符号链接/junction（jvms 创建，无 .lnk 后缀）
      if (platform() === 'win32' && existsSync(javaHome)) {
        try {
          const psCommand = `(Get-Item -LiteralPath '${javaHome.replace(/'/g, "''")}' -ErrorAction Stop).Target`
          const target = execSync(`powershell -Command "${psCommand}"`, { encoding: 'utf8', timeout: 5000 }).trim()
          if (target) {
            const resolved = target.replace(/[\\/]bin[\\/]java\.exe$/i, '')
            if (existsSync(join(resolved, 'bin', 'java.exe'))) {
              javaHome = resolved
              log.info(`[JavaCheck] Path resolved to: ${javaHome}`)
            } else {
              log.info(`[JavaCheck] Target doesn't have java.exe, using as-is: ${target}`)
            }
          }
        } catch (e: any) {
          // Get-Item .Target 会抛异常说明不是符号链接，继续执行
          log.info(`[JavaCheck] Not a symlink/junction, using JAVA_HOME as-is`)
        }
      }

      if (javaHome) {
        const javaExe = join(javaHome, 'bin', 'java.exe')
        if (existsSync(javaExe)) {
          const result = await testJavaExe(javaExe)
          if (result.ok) {
            return { ok: true, javaHome, javaVersion: result.majorVersion }
          }
          log.warn(`[JavaCheck] JAVA_HOME java test failed: ${result.error}`)
        }
      }
    }

    // 策略2：从 PATH 中找 java（最可靠）
    if (platform() === 'win32') {
      try {
        const { stdout } = await execAsync('where.exe java', { encoding: 'utf8', timeout: 5000 } as any)
        const javaPath = stdout.trim().split('\n')[0].replace(/[\\/]bin[\\/]java\.exe$/i, '')
        if (javaPath && existsSync(join(javaPath, 'bin', 'java.exe'))) {
          log.info(`[JavaCheck] Found java in PATH: ${javaPath}`)
          const result = await testJavaExe(join(javaPath, 'bin', 'java.exe'))
          if (result.ok) {
            return { ok: true, javaHome: javaPath, javaVersion: result.majorVersion }
          }
        }
      } catch (e: any) {
        log.warn(`[JavaCheck] where.exe java failed: ${e.message}`)
      }
    }

    // 所有策略都失败
    return {
      ok: false,
      error: `无法找到可用的 Java 环境（当前 JAVA_HOME: ${javaHome || '(未设置)'}）`,
      hint: `请确保 JDK 已安装（https://adoptium.net/）\n` +
            `并正确设置 JAVA_HOME 环境变量（指向 JDK 根目录，如 C:\\Program Files\\Eclipse Adoptium\\jdk-17.x.x-hotspot）\n` +
            `可通过 PowerShell 查找：where.exe java`
    }
  }

  /**
   * 测试 java.exe 是否可用
   */
  async function testJavaExe(javaExe: string): Promise<{ ok: boolean; output?: string; error?: string; majorVersion?: number }> {
    return new Promise((resolve) => {
      let output = ''
      const timer = setTimeout(() => {
        child.kill()
        resolve({ ok: false, output, error: '超时（8秒）' })
      }, 8000)

      // Windows 直接 spawn java.exe，避免 cmd.exe /c 破坏含空格路径和 stderr 重定向
      // Unix 用 bash -c
      const child = platform() === 'win32'
        ? spawn(javaExe, ['-version'])
        : spawn('/bin/bash', ['-c', `"${javaExe}" -version`])

      if (platform() === 'win32') {
        child.stderr?.on('data', (d: Buffer) => { output += new TextDecoder('gbk').decode(d) })
        child.stdout?.on('data', (d: Buffer) => { output += new TextDecoder('gbk').decode(d) })
      } else {
        child.stderr?.on('data', (d: Buffer) => { output += d.toString('utf8') })
        child.stdout?.on('data', (d: Buffer) => { output += d.toString('utf8') })
      }

      child.on('close', (code) => {
        clearTimeout(timer)
        const clean = output.trim().replace(/\n/g, ' ').substring(0, 200)
        log.info(`[JavaCheck] java test: code=${code}, output=${clean}`)
        if (code === 0 || output.toLowerCase().includes('version')) {
          const majorVersion = parseJavaMajorVersion(output)
          resolve({ ok: true, output: clean, majorVersion })
        } else {
          resolve({ ok: false, output, error: `exit ${code}` })
        }
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({ ok: false, error: err.message })
      })
    })
  }

  /**
   * Windows 下通过 spawn 执行命令并捕获 GBK 编码输出
   */
  function execPromise(cmd: string, opts: { timeout?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const child = spawn('cmd.exe', ['/c', cmd], { timeout: opts.timeout } as any)
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('gbk') })
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('gbk') })
      child.on('close', (code) => resolve({ stdout, stderr, code: code || 0 }))
      child.on('error', (err) => resolve({ stdout, stderr, code: 1 }))
    })
  }

  /**
   * 检查 Nacos 健康状态
   */
  async function checkNacosHealth(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      // 直接检查根路径响应，Nacos 启动成功后根路径会返回 200
      const url = `http://127.0.0.1:${port}/nacos/`
      const lib = http
      const req = lib.get(url, { timeout: 2000 }, (res) => {
        // Nacos 启动成功后，任何 2xx/3xx 响应都说明服务就绪
        resolve(res.statusCode && res.statusCode < 500)
        res.resume() // 消耗响应体
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  }

  /**
   * 生成启动命令和环境变量（Windows / Unix）
   * 策略：通过 spawn 的 env 参数传递环境变量，完全避免命令字符串中的引号问题
   * Nacos 使用 CUSTOM_NACOS_MEMORY 环境变量设置 JVM 内存
   * JAVA_HOME 必须设置，否则 startup.cmd 会立即退出
   */
  function buildJvmEnvArgs(instance: any, nacosHome: string, javaHome?: string): { cmd: string, args: string[], env: Record<string, string> } {
    const jvmXms = instance.jvm_xms || '512m'
    const jvmXmx = instance.jvm_xmx || '1024m'
    const javaHomeResolved = javaHome || process.env.JAVA_HOME

    if (!javaHomeResolved) {
      throw new Error(
        'JAVA_HOME 未设置！\n\n' +
        '请在系统环境变量中配置 JAVA_HOME，指向 JDK 安装目录。\n' +
        '下载地址：https://adoptium.net/（推荐 Temurin JDK 8）\n\n' +
        '配置示例（Windows）：\n' +
        '  变量名：JAVA_HOME\n' +
        '  变量值：C:\\Program Files\\Eclipse Adoptium\\jdk-8.0.422.5-hotspot'
      )
    }

    if (!javaHome) {
      throw new Error(
        'JAVA_HOME 未设置！\n\n' +
        '请在系统环境变量中配置 JAVA_HOME，指向 JDK 安装目录。\n' +
        '下载地址：https://adoptium.net/（推荐 Temurin JDK 8）\n\n' +
        '配置示例（Windows）：\n' +
        '  变量名：JAVA_HOME\n' +
        '  变量值：C:\\Program Files\\Eclipse Adoptium\\jdk-8.0.422.5-hotspot'
      )
    }

    // 通过 spawn env 参数传递环境变量（避免命令字符串引号问题）
    const childEnv: Record<string, string> = { ...process.env, JAVA_HOME: javaHomeResolved || '' }
    childEnv['CUSTOM_NACOS_MEMORY'] = `-Xms${jvmXms} -Xmx${jvmXmx}`

    if (platform() === 'win32') {
      // Windows：直接 spawn java.exe（参数逐个传递），完全绕过 cmd.exe 字符串解析问题
      const javaExe = join(javaHomeResolved, 'bin', 'java.exe')
      const nacosJar = join(nacosHome, 'target', 'nacos-server.jar')
      const port = instance.port || '8848'
      // loader.path 和 nacos.home 必须用正斜杠，Java 在 Windows 上可正确处理
      const nacosHomeProp = nacosHome.replace(/\\/g, '/')
      const confPath = 'file:' + nacosHomeProp + '/conf/'
      // loader.path 必须包含 nacos/bin，让 PropertiesLauncher 能找到嵌套 JAR 中的 Derby 驱动等
      const loaderPath = nacosHomeProp + '/bin,' + nacosHomeProp + '/plugins'
      // 直接 spawn java.exe，参数作为独立数组元素传递，Node.js 负责正确引用
      // 注意：-jar 之前是 JVM 参数，-jar 之后是程序参数
      const args: string[] = [
        `-Xms${jvmXms}`, `-Xmx${jvmXmx}`,
        `-Dnacos.standalone=true`,
        `-Dnacos.home=${nacosHomeProp}`,
        `-Dloader.path=${loaderPath}`,
      ]
      // Nacos 3.x 架构变化：一个 JVM 内启动 Core / API / Console 三个 Spring Boot 上下文
      // - server.port 会影响所有上下文，导致 Console 和 API 端口冲突
      // - 需要用 nacos.server.main.port 设置 API 端口，Console 使用独立的 nacos.console.port
      // - JRaft 通过反射访问 java.util.ArrayList.elementData，需 --add-opens 开放 JPMS 模块
      const nacosMajor = parseInt(instance.version.replace(/^v/i, '').split('.')[0] || '2', 10)
      if (nacosMajor >= 3) {
        args.push(
          `-Dnacos.server.main.port=${port}`,
          '--add-opens', 'java.base/java.util=ALL-UNNAMED',
          '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
          '--add-opens', 'java.base/java.lang.reflect=ALL-UNNAMED',
          '--add-opens', 'java.base/java.text=ALL-UNNAMED',
          '--add-opens', 'java.base/java.util.concurrent=ALL-UNNAMED',
          '--add-opens', 'java.base/java.util.concurrent.atomic=ALL-UNNAMED',
          '--add-opens', 'java.base/java.util.concurrent.locks=ALL-UNNAMED',
        )
      } else {
        args.push(`-Dserver.port=${port}`)
      }
      args.push(
        '-jar', nacosJar,
        '--spring.config.additional-location=' + confPath,
        '--logging.config=' + nacosHomeProp + '/conf/nacos-logback.xml',
      )
      return { cmd: javaExe, args, env: childEnv }
    } else {
      const startupPath = join(nacosHome, 'bin', 'startup.sh')
      const cmdStr = `"${startupPath}" -m ${instance.mode} -p ${instance.port}`
      return { cmd: 'bash', args: ['-c', cmdStr], env: childEnv }
    }
  }

  ipcMain.handle('instance:start', async (event, instanceId: number) => {
    try {
      const instance = db.getInstanceById(instanceId)
      if (!instance) throw new Error('Instance not found')

      if (runningProcesses.has(instanceId)) {
        throw new Error('实例已在运行中')
      }

      // 检查版本是否存在
      const versionInfo = db.getAllVersions().find(v => v.version === instance.version)
      if (!versionInfo) {
        throw new Error(`版本 ${instance.version} 不存在，请先在版本管理中添加并安装该版本`)
      }

      if (!existsSync(versionInfo.install_path)) {
        throw new Error(`版本目录不存在: ${versionInfo.install_path}\n请确保 Nacos 版本已正确安装`)
      }

      // 查找 nacos 安装目录（支持：直接在 install_path 下，或在 install_path/nacos 子目录下）
      let nacosHome = versionInfo.install_path
      const startupScript = platform() === 'win32' ? 'startup.cmd' : 'startup.sh'
      let startupPath = join(nacosHome, 'bin', startupScript)

      if (!existsSync(startupPath)) {
        // 尝试在 install_path/nacos 子目录下查找（解压后常出现这种情况）
        const subPath = join(versionInfo.install_path, 'nacos', 'bin', startupScript)
        if (existsSync(subPath)) {
          nacosHome = join(versionInfo.install_path, 'nacos')
          startupPath = subPath
          log.info(`[Start] Found startup script in nacos subdirectory: ${subPath}`)
        }
      }

      if (!existsSync(startupPath)) {
        throw new Error(
          `启动脚本不存在: ${startupPath}\n\n` +
          `请检查版本 "${instance.version}" 的安装路径是否正确。\n` +
          `当前路径: ${versionInfo.install_path}\n\n` +
          `期望目录结构:\n` +
          `  ${versionInfo.install_path}/bin/startup.cmd\n` +
          `或\n` +
          `  ${versionInfo.install_path}/nacos/bin/startup.cmd`
        )
      }

      // 预检查：验证 Java 环境是否正常（捕获实际错误）
      const javaCheck = await verifyJavaEnvironment()
      if (!javaCheck.ok) {
        throw new Error(`Java 环境检查失败：\n\n${javaCheck.error}\n\n提示：${javaCheck.hint}`)
      }

      // 校验 JDK 版本是否满足 Nacos 最低要求
      const minJdk = getMinJdkForNacos(instance.version)
      if (javaCheck.javaVersion && javaCheck.javaVersion < minJdk) {
        throw new Error(
          `JDK 版本不满足要求！\n\n` +
          `  当前 JDK 版本：${javaCheck.javaVersion}\n` +
          `  Nacos ${instance.version} 最低要求：JDK ${minJdk}\n\n` +
          `请安装 JDK ${minJdk} 或更高版本，并更新 JAVA_HOME 环境变量。\n` +
          `下载地址：https://adoptium.net/`
        )
      }

      // 构建命令（通过 env 参数传递环境变量）
      // 如果 JAVA_HOME 是快捷方式，使用解析后的真实路径
      const effectiveJavaHome = javaCheck.javaHome || process.env.JAVA_HOME
      const { cmd, args, env: childEnv } = buildJvmEnvArgs(instance, nacosHome, effectiveJavaHome)

      log.info(`[Start] ${instance.name} (${instance.version}), mode=${instance.mode}, port=${instance.port}`)
      log.info(`[Start] JVM: Xms=${instance.jvm_xms || '512m'}, Xmx=${instance.jvm_xmx || '1024m'}`)
      log.info(`[Start] JAVA_HOME: ${effectiveJavaHome}`)
      log.info(`[Start] Cmd: ${cmd} ${args.join(' ')}`)

      // 启动子进程，env 参数确保 JAVA_HOME 和 CUSTOM_NACOS_MEMORY 正确传递
      // 同时补充 SystemRoot（cmd.exe 正常运行必需）
      const childEnvWithSysRoot: Record<string, string> = {
        ...childEnv,
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {})
      }
      const childProcess = spawn(cmd, args, {
        cwd: join(nacosHome, 'bin'),
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: childEnvWithSysRoot
      })

      // 存储进程
      runningProcesses.set(instanceId, childProcess)
      db.updateInstance(instanceId, { pid: childProcess.pid, status: 'starting' })

      // 监听进程输出（stdout 和 stderr 分离）
      // Windows 环境下使用 GBK 解码，避免中文乱码
      const textDecoder = platform() === 'win32' ? new TextDecoder('gbk') : null
      childProcess.stdout?.on('data', (data: Buffer) => {
        const line = platform() === 'win32'
          ? textDecoder!.decode(data)
          : data.toString('utf8')
        log.info(`[Start] [stdout] ${line.trim()}`)
        event.sender.send('instance:log', instanceId, line)
      })
      childProcess.stderr?.on('data', (data: Buffer) => {
        const line = platform() === 'win32'
          ? textDecoder!.decode(data)
          : data.toString('utf8')
        log.info(`[Start] [stderr] ${line.trim()}`)
      })

      childProcess.on('exit', (code) => {
        log.info(`[Start] ${instance.name} exited with code ${code}`)
        runningProcesses.delete(instanceId)
        db.updateInstance(instanceId, { pid: null, status: 'stopped' })
        // 如果 JAVA_HOME 未设置，给出明确提示
        if (!process.env.JAVA_HOME) {
          event.sender.send('instance:log', instanceId, '\n[错误] JAVA_HOME 未设置！\n请在系统环境变量中添加 JAVA_HOME=C:\\...\\jdk 指向 JDK 安装目录。\n')
        }
        event.sender.send('instance:status-changed', instanceId, 'stopped')
      })

      // 等待 Nacos 真正启动（最多 60 秒）
      log.info(`[Start] Waiting for ${instance.name} to be ready on port ${instance.port}...`)
      let ready = false
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000))
        if (!runningProcesses.has(instanceId)) break // 进程已退出
        ready = await checkNacosHealth(instance.port)
        if (ready) {
          log.info(`[Start] ${instance.name} is ready!`)
          event.sender.send('instance:status-changed', instanceId, 'running')
          db.updateInstance(instanceId, { status: 'running' })
          // 自动为本地实例创建/更新连接配置
          try {
            db.upsertLocalConnection(instanceId)
          } catch (e: any) {
            log.warn('[Start] Failed to upsert local connection:', e.message)
          }
          break
        }
      }

      if (!runningProcesses.has(instanceId)) {
        // 进程已退出
        return { success: false, pid: childProcess.pid, message: '进程启动后立即退出，请查看日志' }
      }

      if (!ready) {
        log.warn(`[Start] ${instance.name} health check timeout, but process is running`)
      }

      return { success: true, pid: childProcess.pid, message: ready ? '启动成功' : '进程已启动（健康检查超时）' }
    } catch (error: any) {
      log.error('[Start] Failed:', error)
      throw error
    }
  })

  ipcMain.handle('instance:stop', async (_, instanceId: number) => {
    try {
      const process = runningProcesses.get(instanceId)
      if (!process) {
        throw new Error('Process not running')
      }

      log.info('Stopping instance:', instanceId)

      if (process.platform === 'win32') {
        exec(`taskkill /PID ${process.pid} /T /F`)
      } else {
        process.kill('SIGTERM')
      }

      runningProcesses.delete(instanceId)
      db.updateInstance(instanceId, { pid: null, status: 'stopped' })

      return { success: true }
    } catch (error: any) {
      log.error('Failed to stop instance:', error)
      throw error
    }
  })

  ipcMain.handle('instance:is-running', (_, instanceId: number) => {
    return runningProcesses.has(instanceId)
  })

  // ==================== 健康检查 ====================
  ipcMain.handle('instance:health', async (_, instanceId: number) => {
    try {
      const instance = db.getInstanceById(instanceId)
      if (!instance) throw new Error('Instance not found')

      // 不管 runningProcesses 是否有记录，都做实际端口检测
      // 应用重启后 runningProcesses 为空，但 Nacos 可能仍在运行
      const healthy = await checkNacosHealth(instance.port)
      return { running: healthy, healthy }
    } catch (error: any) {
      throw error
    }
  })

  // 检测所有实例的实际运行状态并同步数据库
  ipcMain.handle('instance:detect-all-status', async () => {
    try {
      const instances = db.getAllInstances()
      for (const inst of instances) {
        const healthy = await checkNacosHealth(inst.port)
        const actualStatus = healthy ? 'running' : 'stopped'
        if (inst.status !== actualStatus) {
          db.updateInstance(inst.id, {
            status: actualStatus,
            pid: healthy ? (inst.pid || 0) : null
          })
        }
      }
      return { success: true }
    } catch (error: any) {
      log.warn('[Detect] Failed to detect all instance status:', error.message)
      return { success: false }
    }
  })

  // ==================== 日志管理 ====================

  /**
   * 读取 Nacos 日志文件列表
   */
  ipcMain.handle('instance:log-files', async (_, instanceId: number) => {
    try {
      const instance = db.getInstanceById(instanceId)
      if (!instance) throw new Error('Instance not found')

      const versionInfo = db.getAllVersions().find(v => v.version === instance.version)
      if (!versionInfo) throw new Error('Version not found')

      const logsDir = join(versionInfo.install_path, 'logs')
      if (!existsSync(logsDir)) return []

      const files = readdirSync(logsDir, { withFileTypes: true })
        .filter(f => f.isFile())
        .map(f => {
          const filePath = join(logsDir, f.name)
          const stats = statSync(filePath)
          return {
            name: f.name,
            size: stats.size,
            modified: stats.mtime.toISOString()
          }
        })
        .sort((a, b) => b.modified.localeCompare(a.modified))

      return files
    } catch (error: any) {
      throw error
    }
  })

  /**
   * 读取 Nacos 日志文件内容
   */
  ipcMain.handle('instance:log-content', async (_, instanceId: number, fileName: string, maxLines = 500) => {
    try {
      const instance = db.getInstanceById(instanceId)
      if (!instance) throw new Error('Instance not found')

      const versionInfo = db.getAllVersions().find(v => v.version === instance.version)
      if (!versionInfo) throw new Error('Version not found')

      const filePath = join(versionInfo.install_path, 'logs', fileName)
      if (!existsSync(filePath)) {
        throw new Error(`日志文件不存在: ${fileName}`)
      }

      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      const tail = lines.slice(-maxLines).join('\n')

      return { content: tail, totalLines: lines.length, fileName }
    } catch (error: any) {
      throw error
    }
  })

  // ==================== 集群状态 ====================

  /**
   * 获取集群节点状态
   */
  ipcMain.handle('instance:cluster-status', async (_, instanceId: number) => {
    try {
      const instance = db.getInstanceById(instanceId)
      if (!instance) throw new Error('Instance not found')

      const versionInfo = db.getAllVersions().find(v => v.version === instance.version)
      if (!versionInfo) throw new Error('Version not found')

      // 解析 cluster.conf 获取节点列表
      const nacosHome = versionInfo.install_path
      const clusterConfPath = join(nacosHome, 'conf', 'cluster.conf')
      const nodes: string[] = []

      if (existsSync(clusterConfPath)) {
        const conf = readFileSync(clusterConfPath, 'utf-8')
        const lines = conf.split('\n').map(l => l.trim()).filter(Boolean)
        for (const line of lines) {
          // 支持格式: 192.168.1.1:8848 或 192.168.1.1:8848:8849
          const match = line.match(/^([\d.]+):(\d+)/)
          if (match) {
            nodes.push(`${match[1]}:${match[2]}`)
          }
        }
      }

      // 对本实例节点进行健康检查
      const nodeStatuses = await Promise.all(
        nodes.map(async (node) => {
          const port = parseInt(node.split(':')[1])
          const healthy = await checkNacosHealth(port)
          return { node, healthy }
        })
      )

      return {
        nodes: nodeStatuses,
        selfNode: `127.0.0.1:${instance.port}`
      }
    } catch (error: any) {
      throw error
    }
  })

  // ==================== 连接管理 ====================
  ipcMain.handle('connection:get-all', () => {
    try {
      return db.getAllConnections()
    } catch (error) {
      log.error('Failed to get connections:', error)
      throw error
    }
  })

  ipcMain.handle('connection:add', (_, connection: db.NacosConnection) => {
    try {
      return db.addConnection(connection)
    } catch (error) {
      log.error('Failed to add connection:', error)
      throw error
    }
  })

  ipcMain.handle('connection:delete', (_, id: number) => {
    try {
      db.deleteConnection(id)
      return true
    } catch (error) {
      log.error('Failed to delete connection:', error)
      throw error
    }
  })

  /**
   * 为本地实例自动创建或更新对应的连接配置
   */
  ipcMain.handle('connection:upsert-local', (_, instanceId: number) => {
    try {
      const conn = db.upsertLocalConnection(instanceId)
      if (conn) {
        log.info(`[Connection] Upserted local connection for instance ${instanceId}: ${conn.name} -> ${conn.server_url}`)
      }
      return conn
    } catch (error) {
      log.error('Failed to upsert local connection:', error)
      throw error
    }
  })

  /**
   * 检测指定 Nacos 连接地址是否可达
   * Nacos 1.x/2.x/3.x 的 API 都在 /nacos context path 下
   */
  ipcMain.handle('connection:health-check', async (_, url: string, _version?: string) => {
    try {
      const baseUrl = url.replace(/\/$/, '')
      const checkUrl = `${baseUrl}/nacos/`

      return new Promise<{ reachable: boolean; error?: string }>((resolve) => {
        const urlObj = new URL(checkUrl)
        const lib = urlObj.protocol === 'https:' ? https : http
        const req = lib.get(checkUrl, { timeout: 3000 }, (res) => {
          resolve({ reachable: res.statusCode !== undefined && res.statusCode < 500 })
          res.resume()
        })
        req.on('error', (err) => resolve({ reachable: false, error: err.message }))
        req.on('timeout', () => { req.destroy(); resolve({ reachable: false, error: 'timeout' }) })
      })
    } catch (error: any) {
      return { reachable: false, error: error.message }
    }
  })

  // ==================== 系统工具 ====================
  ipcMain.handle('shell:open-external', (_, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('shell:open-path', (_, path: string) => {
    return shell.openPath(path)
  })

  // ==================== 对话框 ====================
  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Nacos 安装目录',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:open-file', async (_, options: { title?: string; filters?: any[] }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title || '选择文件',
      filters: options?.filters || [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const content = readFileSync(result.filePaths[0], 'utf-8')
      return { path: result.filePaths[0], content }
    } catch (e: any) {
      throw new Error(`读取文件失败: ${e.message}`)
    }
  })

  ipcMain.handle('dialog:save-file', async (_, options: { title?: string; defaultPath?: string; content: string; filters?: any[] }) => {
    const result = await dialog.showSaveDialog({
      title: options?.title || '保存文件',
      defaultPath: options?.defaultPath || 'nacos-configs.json',
      filters: options?.filters || [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    try {
      writeFileSync(result.filePath, options.content, 'utf-8')
      return true
    } catch (e: any) {
      throw new Error(`保存文件失败: ${e.message}`)
    }
  })

  // ==================== 版本下载（从 GitHub） ====================
  ipcMain.handle('version:get-releases', async () => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/alibaba/nacos/releases',
        method: 'GET',
        headers: {
          'User-Agent': 'Nacos-Desktop-Manager',
          'Accept': 'application/vnd.github.v3+json'
        }
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            const releases = JSON.parse(data)
            // 只返回正式版本，过滤掉 prerelease 和 draft
            const stable = releases
              .filter((r: any) => !r.prerelease && !r.draft)
              .map((r: any) => ({
                tag_name: r.tag_name,
                name: r.name,
                published_at: r.published_at,
                body: r.body,
                assets: r.assets.map((a: any) => ({
                  name: a.name,
                  size: a.size,
                  browser_download_url: a.browser_download_url
                }))
              }))
            resolve(stable)
          } catch (e) {
            reject(new Error('解析 GitHub API 响应失败'))
          }
        })
      })

      req.on('error', () => {
        reject(new Error('无法连接 GitHub，请检查网络'))
      })

      req.setTimeout(10000, () => {
        req.destroy()
        reject(new Error('请求超时'))
      })

      req.end()
    })
  })

  // 下载并解压版本
  ipcMain.handle('version:download', async (event, version: string, downloadUrl: string) => {
    const versionsPath = db.getVersionsPath()
    const targetDir = join(versionsPath, version)
    const nacosDir = join(targetDir, 'nacos')

    // 检查是否已安装（nacos 目录存在且有内容）
    if (existsSync(nacosDir)) {
      const binPath = join(nacosDir, 'bin', process.platform === 'win32' ? 'startup.cmd' : 'startup.sh')
      if (existsSync(binPath)) {
        return { success: true, path: nacosDir, message: '版本已安装' }
      }
    }

    // 清理可能存在的残留目录（上次失败留下）
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }

    // 创建临时下载目录
    mkdirSync(targetDir, { recursive: true })

    // 专门处理重定向后的下载（不计入重试次数）
    function doDownloadWithRedirect(url: string, filePath: string, resolve: () => void, reject: (err: Error) => void) {
      const urlObj = new URL(url)
      const lib = urlObj.protocol === 'https:' ? https : http

      log.info(`[Download] Following redirect to: ${url}`)

      const req = lib.get(url, {
        headers: { 'User-Agent': 'Nacos-Desktop-Manager' },
        timeout: 120000
      }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`))
          return
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedSize = 0
        const chunks: Buffer[] = []

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          downloadedSize += chunk.length
          if (totalSize > 0) {
            const percent = Math.round((downloadedSize / totalSize) * 100)
            event.sender.send('download:progress', version, percent, downloadedSize, totalSize)
          }
        })

        response.on('end', () => {
          log.info(`[Download] Redirect download complete: ${downloadedSize} bytes`)

          if (downloadedSize === 0) {
            reject(new Error('下载失败：文件大小为 0'))
            return
          }

          const buffer = Buffer.concat(chunks)
          writeFileSync(filePath, buffer)
          log.info(`[Download] File written: ${filePath}, size: ${buffer.length}`)

          extractArchive(filePath, targetDir, version, event)
            .then(() => {
              if (!existsSync(nacosDir)) {
                throw new Error('解压失败：未找到 nacos 目录')
              }
              unlinkSync(filePath)
              log.info(`[Download] Nacos ${version} installed successfully`)
              resolve()
            })
            .catch((err: any) => {
              reject(err)
            })
        })

        response.on('error', (err: Error) => {
          reject(new Error(`下载失败: ${err.message}`))
        })
      })

      req.on('error', (err: Error) => {
        reject(new Error(`下载失败: ${err.message}`))
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('下载超时'))
      })
    }

    // 下载函数
    function doDownload(attempt: number): Promise<void> {
      return new Promise((resolve, reject) => {
        const fileName = downloadUrl.split('/').pop() || `nacos-${version}.zip`
        const filePath = join(targetDir, fileName)

        log.info(`[Download] Attempt ${attempt}/3: ${version} from ${downloadUrl}`)

        const urlObj = new URL(downloadUrl)
        const lib = urlObj.protocol === 'https:' ? https : http

        const req = lib.get(downloadUrl, {
          headers: { 'User-Agent': 'Nacos-Desktop-Manager' },
          timeout: 120000 // 120 秒超时
        }, (response) => {
          // 跟随重定向（GitHub 返回 302/301 等）
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
            const location = response.headers.location
            if (location) {
              log.info(`[Download] Redirected to: ${location}`)
              // 解析完整 URL（支持相对路径）
              const redirectUrl = new URL(location, downloadUrl).toString()
              // 递归调用下载（使用新地址，不计入重试次数）
              doDownloadWithRedirect(redirectUrl, filePath, resolve, reject)
              return
            }
          }

          // 检查 HTTP 状态码（必须是 200）
          if (response.statusCode !== 200) {
            reject(new Error(`下载失败: HTTP ${response.statusCode}`))
            return
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10)
          let downloadedSize = 0
          const chunks: Buffer[] = []

          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
            downloadedSize += chunk.length
            if (totalSize > 0) {
              const percent = Math.round((downloadedSize / totalSize) * 100)
              event.sender.send('download:progress', version, percent, downloadedSize, totalSize)
            }
          })

          response.on('end', () => {
            log.info(`[Download] Attempt ${attempt} complete: ${downloadedSize} bytes`)

            if (downloadedSize === 0) {
              reject(new Error('下载失败：文件大小为 0'))
              return
            }

            // 写入文件
            const buffer = Buffer.concat(chunks)
            writeFileSync(filePath, buffer)
            log.info(`[Download] File written: ${filePath}, size: ${buffer.length}`)

            // 解压
            extractArchive(filePath, targetDir, version, event)
              .then(() => {
                // 验证解压成功
                if (!existsSync(nacosDir)) {
                  throw new Error('解压失败：未找到 nacos 目录')
                }

                // 删除压缩包
                unlinkSync(filePath)
                log.info(`[Download] Nacos ${version} installed successfully`)
                resolve()
              })
              .catch((err) => {
                log.error('[Download] Extract failed:', err)
                reject(new Error(`解压失败: ${err.message}`))
              })
          })

          response.on('error', (err: Error) => {
            log.error(`[Download] Response error (attempt ${attempt}):`, err.message)
            reject(new Error(`下载失败: ${err.message}`))
          })
        })

        req.on('error', (err: Error) => {
          log.error(`[Download] Request error (attempt ${attempt}):`, err.message)
          reject(new Error(`下载失败: ${err.message}`))
        })

        req.on('timeout', () => {
          req.destroy()
          reject(new Error('下载超时'))
        })
      })
    }

    // 重试逻辑：最多 3 次
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await doDownload(attempt)
        // 成功，清理临时文件，返回结果（返回 nacos 子目录的完整路径）
        return { success: true, path: nacosDir, message: '安装成功' }
      } catch (err: any) {
        lastError = err.message
        log.warn(`[Download] Attempt ${attempt} failed: ${lastError}`)
        
        if (attempt < 3) {
          // 删除不完整的文件，准备重试
          const fileName = downloadUrl.split('/').pop() || `nacos-${version}.zip`
          const filePath = join(targetDir, fileName)
          if (existsSync(filePath)) {
            unlinkSync(filePath)
          }
          log.info(`[Download] Retrying in 3 seconds...`)
          await new Promise(r => setTimeout(r, 3000)) // 等 3 秒再重试
        }
      }
    }

    // 全部失败，清理目录
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
    throw new Error(`下载失败（已重试 3 次）: ${lastError}`)
  })

  // 取消下载（通过删除进程关联的下载任务）
  ipcMain.handle('version:cancel-download', (_, version: string) => {
    // 这里简化处理，实际可以通过 Map 跟踪下载任务
    log.info(`Download cancelled for version: ${version}`)
    return { success: true }
  })

  // ==================== Java 检测 ====================
  ipcMain.handle('system:check-java', () => {
    return new Promise((resolve) => {
      exec('java -version 2>&1', (error, stdout, stderr) => {
        if (error) {
          resolve({ installed: false, version: null })
        } else {
          const match = (stdout + stderr).match(/version "([\d._]+)"/)
          resolve({ installed: true, version: match ? match[1] : null })
        }
      })
    })
  })

  // ==================== Nacos HTTP 代理（绕过渲染进程 CORS 限制） ====================
  /**
   * 通用 Nacos HTTP 代理请求
   * 渲染进程无法直接向 http://127.0.0.1:8848 发跨域请求，统一走主进程代理
   *
   * options:
   *   method  - GET | POST | DELETE | PUT（默认 GET）
   *   url     - 完整 URL，如 http://127.0.0.1:8848/nacos/v1/cs/configs
   *   params  - query string 参数对象
   *   body    - POST body（字符串或对象）
   *   headers - 额外请求头
   *
   * 返回: { status, data }
   *   - status: HTTP 状态码
   *   - data:   响应体（string 或已解析的 JSON 对象）
   */
  ipcMain.handle('nacos:request', async (_, options: {
    method?: string
    url: string
    params?: Record<string, any>
    body?: string | Record<string, any>
    headers?: Record<string, string>
  }) => {
    const { method = 'GET', url, params, body, headers = {} } = options

    // 拼接 query string
    let fullUrl = url
    if (params && Object.keys(params).length > 0) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      if (qs) fullUrl += (url.includes('?') ? '&' : '?') + qs
    }

    // 序列化 body
    let bodyStr = ''
    if (body) {
      if (typeof body === 'string') {
        bodyStr = body
      } else {
        bodyStr = JSON.stringify(body)
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json'
      }
    }

    log.info(`[NacosProxy] ${method} ${fullUrl}`)

    return new Promise<{ status: number; data: any }>((resolve, reject) => {
      try {
        const urlObj = new URL(fullUrl)
        const lib = urlObj.protocol === 'https:' ? https : http

        const reqHeaders: Record<string, string> = {
          'User-Agent': 'Nacos-Desktop-Manager',
          ...headers
        }
        if (bodyStr) {
          reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr).toString()
        } else if (method.toUpperCase() === 'PUT' || method.toUpperCase() === 'POST') {
          reqHeaders['Content-Length'] = '0'
        }

        const reqOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: method.toUpperCase(),
          headers: reqHeaders,
          timeout: 15000
        }

        const req = lib.request(reqOptions, (res) => {
          let rawData = ''
          res.on('data', (chunk) => { rawData += chunk.toString() })
          res.on('end', () => {
            let parsed: any = rawData
            // 尝试解析 JSON
            try { parsed = JSON.parse(rawData) } catch {}
            resolve({ status: res.statusCode || 0, data: parsed })
          })
        })

        req.on('error', (err) => {
          log.error(`[NacosProxy] Request error: ${err.message}`)
          reject(new Error(`Network Error: ${err.message}`))
        })
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('Request Timeout'))
        })

        if (bodyStr) req.write(bodyStr)
        req.end()
      } catch (e: any) {
        reject(new Error(`URL parse error: ${e.message}`))
      }
    })
  })

  // ==================== Nacos 本地配置文件管理 ====================

  /**
   * 获取指定实例的 conf/ 目录下所有可编辑配置文件列表
   */
  ipcMain.handle('instance:conf-files', async (_, instanceId: number) => {
    try {
      const instance = db.getInstanceById(instanceId)
      if (!instance) throw new Error('实例不存在')

      const versionInfo = db.getAllVersions().find(v => v.version === instance.version)
      if (!versionInfo) throw new Error('版本信息不存在，请先在版本管理中安装该版本')

      // 尝试查找 Nacos 的 conf 目录（支持直接在 install_path 下或在 install_path/nacos 子目录下）
      let confDir = join(versionInfo.install_path, 'conf')
      if (!existsSync(confDir)) {
        confDir = join(versionInfo.install_path, 'nacos', 'conf')
      }
      if (!existsSync(confDir)) {
        throw new Error(`找不到配置目录，请确认版本 ${instance.version} 已正确安装\n期望路径: ${join(versionInfo.install_path, 'conf')}`)
      }

      const allowedExts = ['properties', 'conf', 'xml', 'yaml', 'yml', 'json', 'cfg', 'ini', 'txt', 'sh', 'cmd']
      const entries = readdirSync(confDir, { withFileTypes: true })
      const files = entries
        .filter(e => {
          if (!e.isFile()) return false
          const ext = e.name.split('.').pop()?.toLowerCase() || ''
          return allowedExts.includes(ext)
        })
        .map(e => {
          const filePath = join(confDir, e.name)
          const stats = statSync(filePath)
          return {
            name: e.name,
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return { confDir, files }
    } catch (error: any) {
      log.error('conf-files error:', error)
      throw error
    }
  })

  /**
   * 读取配置文件内容
   */
  ipcMain.handle('instance:read-conf', async (_, filePath: string) => {
    try {
      if (!existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`)
      }
      // 安全检查：只允许读取 .properties、.conf、.xml、.yaml、.yml 和 .json 文件
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const allowedExts = ['properties', 'conf', 'xml', 'yaml', 'yml', 'json', 'cfg', 'ini', 'txt', 'sh', 'cmd']
      if (!allowedExts.includes(ext)) {
        throw new Error(`不支持编辑该类型的文件 (.${ext})`)
      }
      const content = readFileSync(filePath, 'utf-8')
      return { content, path: filePath }
    } catch (error: any) {
      log.error('read-conf error:', error)
      throw error
    }
  })

  /**
   * 写入配置文件内容（自动备份原文件）
   */
  ipcMain.handle('instance:write-conf', async (_, filePath: string, content: string) => {
    try {
      if (!existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`)
      }
      // 安全检查
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const allowedExts = ['properties', 'conf', 'xml', 'yaml', 'yml', 'json', 'cfg', 'ini', 'txt', 'sh', 'cmd']
      if (!allowedExts.includes(ext)) {
        throw new Error(`不支持编辑该类型的文件 (.${ext})`)
      }

      // 写入前自动备份（备份文件名加时间戳后缀）
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = `${filePath}.bak.${timestamp}`
      const original = readFileSync(filePath, 'utf-8')
      writeFileSync(backupPath, original, 'utf-8')
      log.info(`[ConfEdit] Backup created: ${backupPath}`)

      // 写入新内容
      writeFileSync(filePath, content, 'utf-8')
      log.info(`[ConfEdit] Written: ${filePath} (${content.length} chars)`)

      return { success: true, backupPath }
    } catch (error: any) {
      log.error('write-conf error:', error)
      throw error
    }
  })

  /**
   * 获取控制台访问 URL
   * Nacos 3.x+ 控制台在独立端口（nacos.console.port，默认 8080），路径为 /
   * Nacos 2.x- 控制台在 API 端口，路径为 /nacos
   */
  ipcMain.handle('instance:get-console-url', async (_, instanceId: number) => {
    try {
      const instance = db.getInstanceById(instanceId)
      if (!instance) throw new Error('实例不存在')

      const nacosMajor = parseInt(instance.version.replace(/^v/i, '').split('.')[0] || '2', 10)
      if (nacosMajor < 3) {
        // Nacos 1.x / 2.x：控制台在 API 端口，路径 /nacos
        return { url: `http://127.0.0.1:${instance.port}/nacos` }
      }

      // Nacos 3.x+：从 application.properties 读取 nacos.console.port
      const version = db.getAllVersions().find(v => v.version === instance.version)
      if (!version) {
        // 找不到版本信息，使用默认 8080
        return { url: `http://127.0.0.1:8080/` }
      }

      let nacosHome = version.install_path
      // 兼容路径：如果 install_path 下没有 bin/startup.cmd，尝试 install_path/nacos
      const startupCmd = join(nacosHome, 'bin', 'startup.cmd')
      if (!existsSync(startupCmd) && existsSync(join(nacosHome, 'nacos', 'bin', 'startup.cmd'))) {
        nacosHome = join(nacosHome, 'nacos')
      }

      const appPropPath = join(nacosHome, 'conf', 'application.properties')
      let consolePort = 8080
      if (existsSync(appPropPath)) {
        const content = readFileSync(appPropPath, 'utf-8')
        const match = content.match(/^\s*nacos\.console\.port\s*=\s*(\d+)\s*$/m)
        if (match) consolePort = parseInt(match[1], 10)
      }

      return { url: `http://127.0.0.1:${consolePort}/` }
    } catch (error: any) {
      log.error('get-console-url error:', error)
      throw error
    }
  })

  log.info('All IPC handlers registered')
}
