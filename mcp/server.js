#!/usr/bin/env node
/**
 * wbptc —— WorkBuddy 的 PTC 接入口（MCP server）。
 *
 * 它在 WorkBuddy 与 dsh 之间当桥：
 *   模型写一段程序 → run_program → 落成临时文件 → 启 dsh 的 wbptc profile
 *   → 程序在 dsh 的 PTC 运行时里执行 → 只有返回值回到模型
 *
 * 几条必须守住的边界：
 *   - DSH_HOME 钉死在项目内的 .dsh-home/，绝不碰用户的 ~/.dsh（ADR-0003）
 *   - 模型凭据环境变量一律抹掉（ADR-0001）
 *   - 不启动 dsh 的模型：wbptc profile 里所有能走到 API 的行都是 disabled
 *
 * 用法（由 WorkBuddy 按 MCP 配置拉起）：
 *   node mcp/server.js
 *
 * 环境变量：
 *   DSH_BIN            覆盖 dsh 可执行文件路径
 *   WBPTC_TIMEOUT_MS   单次执行上限，默认 300000
 *   WBPTC_WORKSPACE    默认工作目录；未设置时用 WorkBuddy 传来的 cwd
 */
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = path.join(REPO_ROOT, '.dsh-home')
const SDK_DOC = path.join(REPO_ROOT, 'mcp', 'tools-sdk.md')
const PROFILE = 'wbptc'
const TIMEOUT_MS = Number(process.env.WBPTC_TIMEOUT_MS ?? 300_000)

const DSH_BIN = process.env.DSH_BIN
  ?? 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd'

/** 抹掉一切可能被 dsh 读到的模型凭据：即使哪一行 provider 被误开启也无凭证可用。 */
function safeEnv(workspace) {
  const env = { ...process.env }
  delete env.DEEPSEEK_API_KEY
  delete env.DEEPSEEK_API_BASE
  delete env.DEEPSEEK_BASE_URL
  env.DSH_HOME = DSH_HOME
  env.WBPTC_WORKSPACE = workspace
  return env
}

/**
 * 起一次 dsh，跑一个程序文件，收回结果。
 * @param {string} programFile - 程序文件的绝对路径。
 * @param {string} workspace - 会话 cwd 兼沙箱作用根。
 * @returns {Promise<{code: number|null, stdout: string, stderr: string, timedOut: boolean}>}
 */
function execDsh(programFile, workspace) {
  return new Promise(resolve => {
    // Windows 上 dsh 是 .cmd，必须经 cmd.exe。两个坑叠在一起：
    //   1. 路径含空格（"DeepSeek Harness"），所以每一段都要引号
    //   2. `cmd /s /c` 会剥掉最外层的一对引号，所以整条命令外面还要再套一层
    // 最终形态：cmd /d /s /c ""<dsh.cmd>" --profile <p> "<file>""
    const command = `""${DSH_BIN}" --profile ${PROFILE} "${programFile}""`
    const child = spawn('cmd.exe', ['/d', '/s', '/c', command], {
      cwd: REPO_ROOT,
      env: safeEnv(workspace),
      windowsVerbatimArguments: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const cap = 8 * 1024 * 1024

    child.stdout.on('data', chunk => { if (stdout.length < cap) stdout += chunk })
    child.stderr.on('data', chunk => { if (stderr.length < cap) stderr += chunk })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, TIMEOUT_MS)

    child.on('error', error => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

async function runProgram({ code, description, workspace }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wbptc-'))
  const file = path.join(dir, 'program.ts')
  await writeFile(file, code, 'utf8')
  try {
    const result = await execDsh(file, workspace ?? process.env.WBPTC_WORKSPACE ?? process.cwd())
    // 过滤掉与程序无关的噪音，只留真正的诊断
    const noise = /ExperimentalWarning|trace-warnings|^\[wbptc\] DSH_HOME|^\[wbptc\] 模型凭据/
    const diagnostics = result.stderr
      .split('\n')
      .filter(line => line.trim() !== '' && !noise.test(line))
      .join('\n')

    const parts = []
    if (result.stdout.trim() !== '') parts.push(result.stdout.trim())
    if (result.timedOut) parts.push(`[超时] 超过 ${TIMEOUT_MS}ms 已终止。`)
    if (diagnostics !== '') parts.push(`--- 诊断 ---\n${diagnostics}`)
    if (parts.length === 0) parts.push(`(程序没有输出；退出码 ${result.code})`)

    return { text: parts.join('\n\n'), isError: result.timedOut || result.code !== 0 }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const server = new Server(
  { name: 'wbptc', version: '0.0.1' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'run_program',
    description: [
      'Run a TypeScript program in a dsh PTC runtime, where every file and shell',
      'operation is an awaitable function on `tools`.',
      '',
      'Use this when a task needs MANY tool calls: reading a dozen files, globbing then',
      'filtering then aggregating, looping or branching over results, cross-referencing.',
      'The whole sequence runs in ONE execution and only what the program returns comes',
      'back — every intermediate result stays out of this conversation.',
      '',
      'Do NOT use it for a single read, edit or command: the program has to boot a runtime,',
      'so one call through it costs more than calling the tool directly.',
      '',
      `The program is an async TypeScript function body (top-level await and return allowed).`,
      `Call tools as \`await tools.name(args)\`. Read the full signature list, the calling`,
      `rules and the available bindings at: ${SDK_DOC}`,
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The program: an async TypeScript function body. Use `return` for the value you want back.',
        },
        description: {
          type: 'string',
          description: 'Short summary of what the program does, for display.',
        },
        workspace: {
          type: 'string',
          description: 'Absolute working directory for the run. Defaults to the current project directory.',
        },
      },
      required: ['code', 'description'],
    },
  }],
}))

server.setRequestHandler(CallToolRequestSchema, async request => {
  const name = request.params.name
  if (name !== 'run_program') {
    return { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true }
  }
  const args = request.params.arguments ?? {}
  if (typeof args.code !== 'string' || args.code.trim() === '') {
    return { content: [{ type: 'text', text: 'code 必须是非空字符串。' }], isError: true }
  }
  try {
    const { text, isError } = await runProgram(args)
    return { content: [{ type: 'text', text }], isError }
  } catch (error) {
    return { content: [{ type: 'text', text: `执行失败：${error?.stack ?? String(error)}` }], isError: true }
  }
})

await server.connect(new StdioServerTransport())
