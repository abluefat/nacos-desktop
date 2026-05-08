/**
 * pre-build.js
 * 确保 icon 文件存在，避免打包时因缺失 icon 而失败
 */

const fs = require('fs')
const path = require('path')

const resourcesDir = path.join(__dirname, '..', 'resources')
const pngPath = path.join(resourcesDir, 'icon.png')
const icoPath = path.join(resourcesDir, 'icon.ico')

// 检查 resources/ 目录
if (!fs.existsSync(resourcesDir)) {
  console.error('❌ resources/ 目录不存在，请先生成图标！')
  process.exit(1)
}

// 检查 icon.png
if (!fs.existsSync(pngPath)) {
  console.error('❌ resources/icon.png 不存在，请先运行：npm run icon')
  process.exit(1)
}

// 检查 icon.ico
if (!fs.existsSync(icoPath)) {
  console.warn('⚠️  resources/icon.ico 不存在，Windows 打包可能无法设置图标')
  console.warn('   建议运行：npm run icon')
}

console.log('✅ 前置检查通过，开始打包...')
