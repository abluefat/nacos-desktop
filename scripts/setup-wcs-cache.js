'use strict'
/**
 * setup-wcs-cache.js
 * 手动下载并设置 electron-builder 所需的工具缓存：
 *   1. winCodeSign-2.6.0 (rcedit.exe 修改 exe 资源/图标)
 *   2. nsis-3.0.4.1 (NSIS 打包安装程序)
 *   3. nsis-resources-3.4.1 (NSIS 资源/插件)
 *
 * 解决问题：
 *   - electron-builder 默认从 GitHub 下载这些工具
 *   - 国内网络访问 GitHub 不稳定，导致构建失败
 *   - 本脚本预先填充缓存，electron-builder 检测到缓存后跳过下载
 */
'use strict'
const { spawnSync } = require('child_process')
const { existsSync, mkdirSync, copyFileSync } = require('fs')
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const CACHE_BASE = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache')
const SEVEN_ZIP = path.join(__dirname, '../node_modules/7zip-bin/win/x64/7za.exe')

const MIRROR = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries'
const RCEDIT_URL = 'https://registry.npmmirror.com/-/binary/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe'

const ARTIFACTS = [
  {
    name: 'rcedit-x64.exe',
    url: 'https://registry.npmmirror.com/-/binary/rcedit/v2.0.0/rcedit-x64.exe',
    urlFallback: 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe',
    dest: path.join(CACHE_BASE, 'winCodeSign', 'winCodeSign-2.6.0', 'rcedit-x64.exe'),
    isFile: true
  },
  {
    name: 'rcedit-ia32.exe',
    url: 'https://registry.npmmirror.com/-/binary/rcedit/v2.0.0/rcedit-ia32.exe',
    urlFallback: 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-ia32.exe',
    dest: path.join(CACHE_BASE, 'winCodeSign', 'winCodeSign-2.6.0', 'rcedit-ia32.exe'),
    isFile: true,
    optional: true
  },
  {
    name: 'nsis-3.0.4.1',
    url: `${MIRROR}/nsis-3.0.4.1/nsis-3.0.4.1.7z`,
    urlFallback: 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z',
    dest7z: path.join(CACHE_BASE, 'nsis', 'nsis-3.0.4.1.7z'),
    destDir: path.join(CACHE_BASE, 'nsis', 'nsis-3.0.4.1'),
    checkFile: path.join(CACHE_BASE, 'nsis', 'nsis-3.0.4.1', 'Bin', 'makensis.exe'),
    isFile: false
  },
  {
    name: 'nsis-resources-3.4.1',
    url: `${MIRROR}/nsis-resources-3.4.1/nsis-resources-3.4.1.7z`,
    urlFallback: 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z',
    dest7z: path.join(CACHE_BASE, 'nsis-resources', 'nsis-resources-3.4.1.7z'),
    destDir: path.join(CACHE_BASE, 'nsis-resources', 'nsis-resources-3.4.1'),
    checkFile: path.join(CACHE_BASE, 'nsis-resources', 'nsis-resources-3.4.1', 'plugins', 'x86-unicode', 'INetC.dll'),
    isFile: false
  }
]

async function main() {
  console.log('🔧 设置 electron-builder 工具缓存 ...\n')

  for (const artifact of ARTIFACTS) {
    console.log(`\n📦 检查 ${artifact.name} ...`)

    if (artifact.isFile) {
      if (existsSync(artifact.dest)) {
        console.log(`   ✅ 已存在: ${artifact.dest}`)
        continue
      }
      mkdirSync(path.dirname(artifact.dest), { recursive: true })
      console.log(`   📥 下载中: ${artifact.url}`)
      try {
        await downloadFile(artifact.url, artifact.dest)
        console.log(`   ✅ 完成: ${artifact.dest}`)
      } catch (e) {
        // 尝试 fallback URL
        if (artifact.urlFallback) {
          console.warn(`   ⚠️  主源失败(${e.message})，尝试 fallback ...`)
          try {
            await downloadFile(artifact.urlFallback, artifact.dest)
            console.log(`   ✅ 完成(fallback): ${artifact.dest}`)
          } catch (e2) {
            if (artifact.optional) console.warn(`   ⚠️  可选项下载失败，跳过`)
            else { console.error(`   ❌ 下载失败: ${e2.message}`); process.exit(1) }
          }
        } else if (artifact.optional) {
          console.warn(`   ⚠️  可选项下载失败，跳过: ${e.message}`)
        } else {
          console.error(`   ❌ 下载失败: ${e.message}`)
          process.exit(1)
        }
      }
    } else {
      // 目录类型（7z 压缩包）
      if (existsSync(artifact.checkFile)) {
        console.log(`   ✅ 已存在: ${artifact.destDir}`)
        continue
      }

      // 下载 7z 文件
      mkdirSync(path.dirname(artifact.dest7z), { recursive: true })
      if (!existsSync(artifact.dest7z)) {
        console.log(`   📥 下载中: ${artifact.url}`)
        try {
          await downloadFile(artifact.url, artifact.dest7z)
          console.log(`   ✅ 下载完成`)
        } catch (e) {
          if (artifact.urlFallback) {
            console.warn(`   ⚠️  主源失败(${e.message})，尝试 fallback ...`)
            try {
              await downloadFile(artifact.urlFallback, artifact.dest7z)
              console.log(`   ✅ 下载完成(fallback)`)
            } catch (e2) {
              console.error(`   ❌ 两个源都失败: ${e2.message}`)
              process.exit(1)
            }
          } else {
            console.error(`   ❌ 下载失败: ${e.message}`)
            process.exit(1)
          }
        }
      } else {
        console.log(`   ✅ 已缓存 7z，跳过下载`)
      }

      // 解压（忽略 symlink 错误 exit code 2）
      console.log(`   📂 解压中 → ${artifact.destDir} ...`)
      mkdirSync(artifact.destDir, { recursive: true })
      const r = spawnSync(SEVEN_ZIP, [
        'x', '-y', artifact.dest7z,
        '-o' + artifact.destDir,
        '-r'
      ], { encoding: 'utf8' })

      if (r.status === 0 || r.status === 2) {
        // exit 2 = 有 warning（通常是 symlink），但主体文件已提取
        if (existsSync(artifact.checkFile)) {
          console.log(`   ✅ 解压完成`)
        } else {
          console.error(`   ❌ 解压后找不到关键文件: ${artifact.checkFile}`)
          console.error(`   输出:\n${r.stdout}\n${r.stderr}`)
          process.exit(1)
        }
      } else {
        console.error(`   ❌ 解压失败 (exit ${r.status})`)
        console.error(r.stdout + '\n' + r.stderr)
        process.exit(1)
      }
    }
  }

  console.log('\n✅ 所有工具缓存设置完成！可以运行 npm run build:win 了。\n')
}

function downloadFile(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'))
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)
    const req = proto.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return downloadFile(res.headers.location, dest, redirectCount + 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        process.stdout.write(`\r   📥 ${(size / 1024 / 1024).toFixed(1)} MB`)
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        process.stdout.write('\n')
        resolve()
      })
    })
    req.on('error', (e) => { file.close(); try { fs.unlinkSync(dest) } catch {}; reject(e) })
    req.on('timeout', () => { req.destroy(); reject(new Error('连接超时，请检查网络/代理后重试')) })
  })
}

main().catch(e => { console.error('❌ 意外错误:', e); process.exit(1) })
