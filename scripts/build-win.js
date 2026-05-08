'use strict'
/**
 * build-win.js — Windows 打包脚本
 *
 * 流程：
 *   1. 检查/下载所有 electron-builder 工具缓存（rcedit + NSIS）
 *   2. 设置环境变量，跳过代码签名
 *   3. 执行 electron-vite build + electron-builder --win
 */
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const LOG = path.join(ROOT, 'build-win.log')

// 继承当前环境，删除可能干扰的签名相关变量
const env = Object.assign({}, process.env)
delete env.WIN_CSC_LINK
delete env.CSC_LINK
delete env.CSC_KEY_PASSWORD
delete env.CSC_NSISTOOLS_PATH
env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
// 使用国内镜像下载 NSIS / winCodeSign 等工具包
env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'

function run(cmd, args, opts) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: true,
    env,
    encoding: 'utf8',
    ...opts
  })
  const output = (result.stdout || '') + (result.stderr || '')
  fs.appendFileSync(LOG, `\n=== ${cmd} ${args.join(' ')} ===\n${output}\n`)
  console.log(output)
  if (result.status !== 0) {
    console.error('❌ 失败 (exit', result.status, ')')
    process.exit(result.status || 1)
  }
}

fs.writeFileSync(LOG, `Build started: ${new Date().toISOString()}\n`)

// Step 0: 确保工具缓存就绪
console.log('🔧 Step 0: 检查工具缓存 ...')
run('node', ['scripts/setup-wcs-cache.js'])

// Step 1: electron-vite build
console.log('\n📦 Step 1: electron-vite build ...')
run('npm', ['run', 'build'])

// Step 2: electron-builder --win
console.log('\n📦 Step 2: electron-builder --win ...')
run('npx', ['electron-builder', '--win'])

console.log('\n✅ 打包完成！产物在 dist/ 目录：')
try {
  const distFiles = fs.readdirSync(path.join(ROOT, 'dist')).filter(f => f.endsWith('.exe'))
  distFiles.forEach(f => console.log('   📁', f))
} catch {}
