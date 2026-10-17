# dsh 升级记录

dsh 桌面应用升级后，内核的工具声明与插件行为都可能变。每次升级在这里记一笔：
版本 → 插件版本 → 变化 → 验证结果。维护流程见 `skill/SKILL.md` 的
「dsh 升级后的维护」。

**为什么记这个**：dsh 没有随包发布 changelog，升级到底改了什么，只能靠对比
`mcp/tools-sdk.md` 的生成结果反推。留一份历史，下次升级时能快速判断
"这次变的是不是上次那类东西"。

## 2026-10-17 — dsh 0.2.1-rc.2；ptc-plus 0.5.0 → 0.5.1

**工具声明的变化**（对比 `git diff mcp/tools-sdk.md`）

| 变化 | 处理 |
| --- | --- |
| 新增 `working_directory`（读/切程序内 cwd） | 实测可用，切换会同步改变 `process.cwd()`；写进 SKILL.md |
| 新增 `read_image`（读图片） | 本项目不可用：`no adapter registered for provider "none"`（零 agent 环境没有附件 provider）；SKILL.md 标注为不可用 |
| `run_code` 的描述在 ptc-plus 0.5.0 下退化成 "erasable syntax only — no enum or namespaces" | 升到 0.5.1 后恢复。实测 0.5.0 下 enum 照样能跑（能力没坏），但描述会让模型不敢用 |
| `edit` / `write` 增加参数顺序提示（`file_path` 在前）；输出 `path` 规范化为绝对路径 | 写进 SKILL.md 的参数约定 |

**验证**

- `scripts/check.sh` 全绿（新增「dsh-ptc-plus >= 0.5.1」断言）
- `enum` / namespace：手动 CLI 与 MCP 双路径通过
- `working_directory`：双路径通过
- `read_image`：双路径确认不可用
- `scripts/setup.sh` 的自动升级路径：实测 `0.5.0 → 0.5.1`

**结论**：插件最低版本提到 0.5.1；`profile/cordis.patch.yml` 无需改动。

## 2026-10-16 — 接入 dsh-ptc-plus 0.5.0

执行内核从默认实现换成 dsh-ptc-plus，解锁程序内 `child_process`（git、构建、本机
命令行程序）。回归项从 19 扩到 21，新增 `examples/06-program-shell.ts` 作为进程能力
的回归入口。决策与代价见 `docs/adr/0006-dsh-ptc-plus-as-execution-kernel.md`。
