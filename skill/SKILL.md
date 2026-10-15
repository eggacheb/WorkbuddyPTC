---
name: wbptc
description: Run a batch of tool calls as one TypeScript program in a dsh PTC runtime, through the run_program tool. Use when a task needs many file or shell operations — reading a dozen files, globbing then filtering then aggregating, looping or branching over results, cross-referencing several sources. Not for single reads, edits or commands.
---

# wbptc —— 把一批工具调用写成一个程序

`run_program` 工具会把一段 TypeScript 程序交给 dsh 的 PTC 运行时执行。程序里每个文件与 shell 操作都是 `tools` 上的可等待函数，**整串调用在一次执行里跑完，只有程序 return 的值回到对话**。

## 什么时候用

**用**：一次任务需要很多次工具调用。

- 读十几个文件再汇总
- glob → 过滤 → 再逐个读 → 聚合
- 对结果集做循环、分支、交叉比对
- 大规模搜索后按条件筛选

**不要用**：单次读、单次改、单条命令。程序要启动一整个运行时（实测约 1–5 秒），单次操作走 `run_program` 比直接调工具更贵。**这是刻意的两种调用约定并存，不是遗漏。**

## 怎么调

```
run_program({
  code: "const r = await tools.ops_glob({ path: '/abs/dir', pattern: ['**/*.md'] })\nreturn r.items",
  description: "列出所有 markdown"
})
```

- `code` 是 **async 函数的函数体**，可用顶层 `await` 与 `return`
- 返回 `{ logs, value }` 形态：`return` 的值会序列化成 JSON 给你
- 只读调用可以用 `Promise.all` 并发；写入类调用按提交顺序独占执行
- **工具调用失败会 reject**，用 `try/catch` 接住继续跑

## 可用工具

完整的类型声明与调用规则在 `run_program` 工具描述里给的那个路径（`mcp/tools-sdk.md`）。**动手写程序前先读它**——参数类型、枚举取值都在里面。

声明之外的几条行为约定：

- 四个 `ops_*` 工具都以会话 cwd 为基准解析相对路径，只接受一个 `path`，**没有** `root` / `cwd` / `file_path` 别名
- `ops_glob` 与 `ops_grep` 不遍历符号链接、重解析点、隐藏文件和 `.git`
- `ops_grep` 的 `pattern` 是 **Rust 正则**，不是 ripgrep 语法
- `ops_replace` 的 `dryRun` 只观察不落盘；真正写入使用内容 revision 校验与原子替换
- 返回 `{ status, phase, changed, matched, ... }` 这套统一信封；`status: "rejected"` 表示被策略层拦下，`error.code` 给出原因

除了 `ops_*`，程序里还有 dsh 自带的 `read` / `write` / `edit` / `glob` / `grep` / `pwsh`。

## 写操作的习惯

`ops_replace` 支持 `dryRun`：**先预演看影响面，再真正落盘**。这不是硬性护栏，是习惯。

## 排错

程序失败时结果里会带 `--- 诊断 ---` 段，里面是 dsh 侧的原始报错。常见两类：

- `POLICY_DENIED`：参数或路径不合规（dsh-ops 的前置检查）
- `worker-exit`：PTC 子进程异常终止，通常意味着沙箱配置被改动过——**不要**把 `profile/cordis.patch.yml` 里的沙箱模式改成 `workspace-write` 或 `read-only`，实测会让整条链路不可用（见 `docs/adr/0004-danger-full-access-on-windows.md`）
