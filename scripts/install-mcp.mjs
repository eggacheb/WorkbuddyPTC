#!/usr/bin/env node
/**
 * 把 wbptc 的 MCP 配置写进 WorkBuddy 的用户配置（~/.workbuddy/mcp.json）。
 *
 * 设计要点：
 *   - 合并写入：只覆盖 mcpServers.wbptc 这一个键，其他条目原样保留
 *   - 写前备份：文件名带时间戳，写坏了随时能还原
 *   - 路径全部动态：command 用当前 node 的可执行文件（process.execPath），
 *     args 用本仓库的 mcp/server.js——所以仓库放哪都行，换机器也不用改
 *   - DSH_BIN 优先取环境变量（setup.sh 会导出），没拿到时自己按常见位置找一遍
 *     （scripts/lib-find-dsh.mjs，与 mcp/server.js 共用同一份候选表）
 *
 * 用法：
 *   node scripts/install-mcp.mjs           # 写入
 *   node scripts/install-mcp.mjs --print   # 只打印将要写入的内容，不动文件
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findDsh } from './lib-find-dsh.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKBUDDY_DIR = path.join(homedir(), '.workbuddy')
const CONFIG = path.join(WORKBUDDY_DIR, 'mcp.json')
const SERVER = path.join(REPO_ROOT, 'mcp', 'server.js')

// node 用系统安装的稳定路径。process.execPath 可能是带版本号段的托管副本
// （例如 .workbuddy/binaries/node/versions/<版本>/node.exe），升级后路径会变，
// 写进配置会让 MCP server 起不来。系统路径找不到时才回退。
function pickNode() {
  const stable = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ]
  for (const candidate of stable) {
    if (existsSync(candidate)) return candidate
  }
  return process.execPath
}

// DSH_BIN 可能来自 git bash 的 MSYS 路径（/c/Users/...），cmd 不认。
// 统一规范化成 Windows 原生格式再写进配置。
function toWindowsPath(p) {
  if (!p) return ''
  const msys = /^\/([a-zA-Z])\/(.*)$/.exec(p)
  if (msys) return `${msys[1].toUpperCase()}:\\${msys[2].replace(/\//g, '\\')}`
  return p.replace(/\//g, '\\')
}

const nodeBin = pickNode()
const dshBin = toWindowsPath(findDsh() ?? '')

const entry = {
  type: 'stdio',
  command: nodeBin,
  args: [SERVER],
}
if (dshBin) entry.env = { DSH_BIN: dshBin }

let config = { mcpServers: {} }
if (existsSync(CONFIG)) {
  // 解析失败就让 JSON.parse 抛出去——宁可中止，也不要悄悄覆盖一份读不懂的配置。
  config = JSON.parse(readFileSync(CONFIG, 'utf8'))
  if (!config.mcpServers || typeof config.mcpServers !== 'object') config.mcpServers = {}
}
config.mcpServers.wbptc = entry
const text = JSON.stringify(config, null, 2) + '\n'

if (process.argv.includes('--print')) {
  process.stdout.write(text)
  process.exit(0)
}

mkdirSync(WORKBUDDY_DIR, { recursive: true })
if (existsSync(CONFIG)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${CONFIG}.bak-${stamp}`
  copyFileSync(CONFIG, backup)
  console.log(`已备份原配置：${backup}`)
}
writeFileSync(CONFIG, text, 'utf8')
console.log(`已写入：${CONFIG}`)
console.log(`  server：${SERVER}`)
console.log(`  node：  ${nodeBin}`)
if (dshBin) {
  console.log(`  dsh：   ${dshBin}`)
} else {
  console.log('  [!] 没找到 dsh —— 配置里不写 DSH_BIN，server 运行时还会自己找一遍；')
  console.log('      若 DeepSeek Harness 装在非默认位置，请在 MCP 配置里手工补上 DSH_BIN。')
}
