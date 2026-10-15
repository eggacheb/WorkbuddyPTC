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

/** 等整棵树挂完再动手，否则注册表可能是半挂载状态。 */
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
  const result = await ctx.tools.execute({
    callId: 'wbptc-1',
    name: 'run_code',
    arguments: { code, description: 'wbptc runner' },
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
