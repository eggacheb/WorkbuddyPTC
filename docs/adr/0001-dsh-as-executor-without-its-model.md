# dsh 只当执行器，不启用它的模型

WorkBuddy 需要的是 PTC 的**执行能力与工具能力**，而在 DSH 里这两样由 `ctx.ptcRuntime` 与 `ctx.tools` 工具注册表提供，**与 `llm` 服务无关**。因此本项目写自己的 DSH profile：只挂 `fs`、`subprocess`、`sandbox`、`sandboxPolicy`、`ptc-runtime-node`、`dsh-tools` 以及所需的工具插件，**不挂 `dsh-base`** —— 模型、agent 循环和三个会发 API 请求的 provider（`llm-deepseek-api-key`、`llm-deepseek-account`、`llm-pi-ai`）全部住在 `dsh-base` 里。代价是放弃 DSH 的 agent 循环、subagent、planning、compaction；换来的是 dsh 的模型在代码路径上不存在。官方已有先例：`sdk-minimal` profile 明确写着它 excludes `dsh-base`。

## Considered Options

- **`dsh --profile headless` + `DSH_TOOLS_MODE=ptc`** —— 官方 demo 路径，网上教程也都是这条。但 headless 把任务作为一条 user message 交给 agent，**必然调用 dsh 的模型**。否决。
- **`@deepseek-ai/dsh-sdk-client`** —— 它驱动的是 agent 回合（`harness.run(prompt)` 等 receipt-to-idle），同样模型在环。否决。
- **给 DSH 写一个 LLM provider，把模型调用桥回 WorkBuddy** —— 能保住 DSH 完整的 agent 循环、planning 与 compaction，但需要双向桥接，且难以证明"绝不落到付费 API"。暂缓，不是否决。

## Consequences

- 本项目对 DSH 的依赖是**运行时库级**而非应用级：只需要 `ptc-runtime-node` 及其四个前置服务（`fs` / `subprocess` / `sandbox` / `sandboxPolicy`）能在无 `dsh-base` 的组合里启动。PTC 模式下的 `run_code` 是注册表里的普通 `ToolDefinition`，入口插件可直接 `ctx.tools.execute('run_code', ...)` 调用，无需 agent。
- 三层保险同时成立，缺一不可：**不挂 `dsh-base`**（没有模型代码路径）、**独立 `DSH_HOME` 不放任何凭证**（就算有漏网代码也无凭证可用）、**不走 headless**（不提交任何 user message）。
- 第一版的验收必须包含一次**反证**：确认在程序里无法触达任何模型调用，而不只是"没观察到"。
- 放弃的能力里，`planning` 与 `compaction` 由 WorkBuddy 侧自己承担（它本来就有会话与上下文管理）；`subagent` 暂时不要。这三条是已知的功能缺口，不是疏漏。
