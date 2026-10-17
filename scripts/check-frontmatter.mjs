#!/usr/bin/env node
/**
 * 校验 skill/SKILL.md 的 frontmatter 能被 YAML 解析。
 *
 * 为什么需要它：description 里若出现 ": "（冒号+空格）而整行没加引号，YAML 会把
 * 它当成嵌套映射，解析直接失败。WorkBuddy 加载技能时不会报错——只是这个技能从此
 * 不触发。静默失效比报错难查得多，所以这里做一道断言。
 *
 * 用法：node scripts/check-frontmatter.mjs [文件路径，默认 skill/SKILL.md]
 */
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? 'skill/SKILL.md'
const text = readFileSync(file, 'utf8')

const fail = (msg) => {
  console.error(`[frontmatter] ${file}: ${msg}`)
  process.exit(1)
}

if (!text.startsWith('---\n')) fail('文件必须以 "---" 开头')
const end = text.indexOf('\n---\n', 4)
if (end < 0) fail('找不到 frontmatter 的结束 "---"')

const lines = text.slice(4, end).split('\n').filter(l => l.trim())
if (lines.length < 2) fail('frontmatter 至少要有 name 与 description')

let name = null
for (const line of lines) {
  const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
  if (!m) fail(`无法识别的行：${JSON.stringify(line)}`)
  const [, key, value] = m
  const quoted = (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  // 未加引号的 YAML 纯量里出现 ": " 会被当成嵌套映射，整个 frontmatter 解析失败
  if (!quoted && /:\s/.test(value)) {
    fail(`字段 ${key} 的值里有裸冒号（": "）—— 整行加引号，否则技能会静默失效`)
  }
  if (key === 'name') name = value
}

if (!name) fail('缺少 name 字段')
if (!/^[a-z0-9-]+$/.test(name)) fail(`name 只能是小写字母、数字和短横线：${name}`)

console.log(`[frontmatter] ${file} 可解析（name=${name}）`)
