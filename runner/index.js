/**
 * wbptc-runner —— WorkBuddy 那一侧的"手"在 dsh 里的落点。
 *
 * 它只做一件事：把一段程序交给注册表里那个叫 `run_code` 的工具，然后把结果
 * 打出来。它 **不启动模型、不提交任何 user message、不触碰会话**。
 *
 * 这一点是整个项目的地基（见 docs/adr/0001-dsh-as-executor-without-its-model.md）：
 * PTC 模式下 `run_code` 是注册表里的一个普通 ToolDefinition，所以外部调用方
 * 可以直接 `ctx.tools.execute()` 它，不需要 agent 在环。DSH 自己的设计笔记也
 * 承认这条路径："Direct executions without an agent still run."
 *
 * 程序里的 `await tools.foo(args)` 会经 dsh 内部的独立控制通道派发回 dsh 自己
 * 的工具实现——不走模型，也不走任何网络往返。
 *
 * 用法： dsh --profile wbptc <程序文件路径>
 */

/**
 * `loader.await()` 之后的可选缓冲。实测 0 就够——await 返回时注册表已经完整
 * （担心的"半挂载"没有发生）。保留这个旋钮：将来若出现注册表不完整的症状，
 * 先把它调大排查。
 */
const LOADER_SETTLE_MS = 0

export const name = 'wbptc-runner'

/** 只依赖工具注册表。刻意不 inject 任何 agent / llm 相关服务。 */
export const inject = ['tools']

export function apply(ctx) {
  const exit = ctx.get('appExit') ?? (code => process.exit(code))
  void run(ctx, exit).catch(error => {
    process.stderr.write(`[wbptc] 入口失败：${error?.stack ?? String(error)}\n`)
    exit(1)
  })
}

async function run(ctx, exit) {
  // 等组合树完全挂载。sdk-minimal 的 README 说明了这个必要性：
  // "not half-mounted"。
  await ctx.get('loader')?.await()
  if (LOADER_SETTLE_MS > 0) await new Promise(r => setTimeout(r, LOADER_SETTLE_MS))

  const args = ctx.get('cmdlineArgs')?.get() ?? []

  // 描述模式：把 DSH 自己生成的 tools:sdk 段吐出来。
  // 这段就是 PTC 模式下系统提示里的那份 TypeScript 声明——由注册表的
  // jsonSchemaToTs() 从工具 JSON Schema 生成，不是我们手写的。
  // WorkBuddy 侧的模型靠它才知道 tools.ops_glob 这些怎么调。
  if (args[0] === '--describe-tools') {
    const cwd = process.env.WBPTC_WORKSPACE ?? process.cwd()
    const agent = await buildAgent(ctx, cwd)
    const assembly = await ctx.get('systemPrompt')?.assemble({ agent })
    const section = (assembly?.sections ?? []).find(s => s.name === 'tools:sdk')
    if (section === undefined) {
      process.stderr.write('[wbptc] 组装结果里没有 tools:sdk 段——注册表可能不在 ptc 模式。\n')
      exit(1)
      return
    }
    process.stdout.write(String(section.text ?? ''))
    exit(0)
    return
  }

  const programPath = args[0]
  if (programPath === undefined || programPath === '') {
    process.stderr.write('[wbptc] 用法：dsh --profile wbptc <程序文件路径>\n')
    exit(2)
    return
  }

  const { readFile } = await import('node:fs/promises')
  let code
  try {
    code = await readFile(programPath, 'utf8')
  } catch (error) {
    process.stderr.write(`[wbptc] 读不到程序文件 ${programPath}：${error?.message ?? error}\n`)
    exit(2)
    return
  }

  const controller = new AbortController()
  const started = Date.now()

  // 会话 cwd 的来源：WBPTC_WORKSPACE 优先——正常流程里它总是被设好
  // （MCP 路径由 mcp/server.js 注入，手动路径由 scripts/dsh.sh 注入"运行目录"）。
  // 兜底到程序文件所在目录，只在绕过 dsh.sh 直接调 dsh 二进制时才走到。
  // 这个值决定了程序里 process.cwd() 与 dsh-ops 相对路径的基准。
  const { dirname, resolve } = await import('node:path')
  const cwd = resolve(process.env.WBPTC_WORKSPACE ?? dirname(resolve(programPath)))

  // 这里必须是一个**真的 Session 实例**，不是字面量对象。
  // run_code 的桥会调 agent.session.append(...)，而 dsh-ops 的文件工具会读
  // session.id / session.header.cwd（lib/file/worker.js 的前置检查）。
  // 官方测试里的构造方式见 packages/boot/plugin-manager/tests/tools.spec.ts。
  const agent = await buildAgent(ctx, cwd)

  const result = await ctx.tools.execute({
    callId: 'wbptc-1',
    name: 'run_code',
    arguments: { code, description: 'wbptc runner' },
    agent,
    signal: controller.signal,
  })
  const elapsed = Date.now() - started

  // 结果内容是渲染好的内容块（日志 + 返回值）；错误也是字段而不是异常。
  const text = (result?.content ?? [])
    .map(block => (typeof block?.text === 'string' ? block.text : ''))
    .join('')
  if (text !== '') process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)

  process.stderr.write(`[wbptc] 耗时 ${elapsed}ms，isError=${result?.isError === true}\n`)
  exit(result?.isError === true ? 1 : 0)
}

/**
 * 造一个最小的、但方法齐全的 agent 对象。
 *
 * 只是给运行时装一个"身份 + 工作目录"，**不挂 agent-loop、不发任何请求**：
 * 这个 Session 没有任何模型回合、不参与任何模型调用。
 *
 * 会话通过官方服务 `ctx.sessions.create()` 创建（entered + announced）而非手工
 * 静态构造——这不是风格选择：session-query 的"活会话"同步读的就是
 * `ctx.sessions.list()`，dsh-ptc-plus 的 observeSession 靠这条链找到会话。
 * 手工构造的 detached 实例不入 store，链路查无此会话（实测报错：
 * session "wbptc" not found）。文件工具不挑：两种构造都不影响它们。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 组合树上下文。
 * @param {string} cwd - 绝对工作目录，同时作为沙箱作用根。
 * @returns {Promise<{session: unknown, options: {provider: string, model: string}}>}
 */
async function buildAgent(ctx, cwd) {
  const mod = await import('@deepseek-ai/dsh-session')
  const { SessionId } = mod
  const id = typeof SessionId === 'function' ? SessionId('wbptc') : 'wbptc'

  // agent 的"作用域上下文"：dsh-ptc-plus 组装 prompt 时要向 agent 作用域注册
  // edit_run_code（agent.ctx.tools.register），没有它会直接抛错（实测：
  // "DSH agent-scoped tools.register is required to expose edit_run_code"）。
  //
  // 这里直接借用 runner 自己的插件 ctx：它是本进程里真实存在的 Cordis 作用域，
  // 带 tools 服务访问，且随进程退出自然销毁。我们只有一个"agent"（wbptc），
  // 不存在多 agent 间的隔离需求。
  const agentCtx = ctx

  const sessions = ctx.get('sessions')
  if (sessions !== undefined && typeof sessions.create === 'function') {
    try {
      const session = sessions.create(id, { meta: { cwd } })
      return {
        session,
        ...(agentCtx !== undefined ? { ctx: agentCtx } : {}),
        // agent-loop 注册的提示词变量会读 context.agent.options.provider / .model
        // （packages/core/agent-loop/src/index.ts 的 ctx.systemPrompt.variable）。
        // 这两个值只用于模板插值，**不触发任何模型调用**——本 profile 也没有可用的
        // provider。写死成 none 是为了让"这个 agent 没有模型"这件事在产物里可见。
        options: { provider: 'none', model: 'none' },
      }
    } catch (error) {
      // 例如同进程内 id 重复（create 会抛）——退回手工构造，不阻断运行。
      process.stderr.write(`[wbptc] sessions.create 失败，退回手工会话：${error?.message ?? error}\n`)
    }
  }

  const { Session, SESSION_FORMAT_VERSION } = mod
  const session = Session.create(id, undefined, {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: Date.now(),
    isSeeded: false,
    cwd,
  })
  return {
    session,
    ...(agentCtx !== undefined ? { ctx: agentCtx } : {}),
    options: { provider: 'none', model: 'none' },
  }
}
