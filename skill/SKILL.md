---
name: wbptc
description: "Run a batch of file operations as one TypeScript program in a dsh PTC runtime, through the run_program tool. Use when a task needs many tool calls — reading a dozen files, globbing then filtering then aggregating, looping or branching over results, cross-referencing several sources. Also use for post-upgrade maintenance: after dsh is updated, check plugin versions, regenerate tool declarations, and re-run the regression. Not for single reads, edits or commands."
---

# wbptc —— 把一批工具调用写成一个程序

`run_program` 工具会把一段 TypeScript 程序交给 dsh 的 PTC 运行时执行。程序里每个文件操作都是 `tools` 上的可等待函数，**整串调用在一次执行里跑完，只有程序 return 的值回到对话**。

## 什么时候用

**用**：一次任务需要很多次操作（读、改、命令都算）。

- **批量阅读**：读十几个文件再汇总、glob → 逐个读 → 聚合、大规模搜索后按条件筛选
- **批量修改**：跨文件替换、批量调整格式（`ops_replace` 先 `dryRun` 预演再落盘）
- **复合任务**：读文件 + 跑命令 + 汇总，混在一条程序里一次做完
- 对结果集做循环、分支、交叉比对

**不要用**：单次读、单次改、单条命令。程序每次要从头启动一遍执行环境（基础约 0.7 秒，操作本身另计），单次操作走 `run_program` 比直接调工具更绕更慢。**这是刻意的两种调用约定并存，不是遗漏。**

## 怎么调

```
run_program({
  code: "const r = await tools.ops_glob({ path: 'D:/proj', pattern: ['**/*.md'] })\nreturn { n: r.items.length }",
  description: "列出所有 markdown"
})
```

- `code` 是 **async 函数的函数体**，可用顶层 `await` 与 `return`。类型注解是提示性的、执行前会被剥离；`enum` / namespace 等完整语法在 ptc-plus **>= 0.5.1** 下可用（见「程序里的能力」）
- **`return` 的值就是要拿的结果本身** —— 直接原样返回，没有 `{ logs, value }` 那一层包裹
- **返回值必须是严格无损 JSON**：任何 `undefined` 属性都会让整个程序失败（见"输出卫生"）
- 只读调用可以用 `Promise.all` 并发；写入类调用按提交顺序独占执行
- **工具调用失败会 reject**（`ToolCallError`，带 `toolName`），用 `try/catch` 接住继续跑

## 依赖版本（2026-10-17 实测）

| 组件 | 最低版本 | 为什么 |
| --- | --- | --- |
| dsh | 0.2.1 | 提供 `working_directory` 绑定；更早的版本没有它 |
| dsh-ptc-plus | 0.5.1 | < 0.5.1 会把 `run_code` 的描述退化成"仅可擦除语法"（能力其实还在，但描述会骗模型） |
| dsh-ops | 0.3.0 | `ops_*` 四件套 |

版本不够时重跑 `bash scripts/setup.sh`，它会自动升级。

## 可用工具

完整的类型声明与调用规则在 `mcp/tools-sdk.md`——`run_program` 的工具描述里贴了它在本机的绝对路径，**动手写程序前先按那个路径读它**；参数类型、枚举取值都在里面。

**实测可用的绑定**（2026-10-17，dsh 0.2.1 + ptc-plus 0.5.1）：

```
read  write  edit  glob  grep
ops_inspect_local_file  ops_grep  ops_glob  ops_replace
pwsh  working_directory
```

`read_image` 也在签名里，但**在本项目不可用**——报 `no adapter registered for provider "none"`（零 agent 环境没有附件 provider）。要看图片别绕它。

### 程序里的能力（2026-10-17 更新：适配 dsh 0.2.1）

执行内核是 **dsh-ptc-plus**（会话级 TypeScript REPL），程序是完整的 Node 运行时：

- **文件能力**：`ops_*` 四件套 + `read` / `write` / `edit` / `glob` / `grep` 完整可用
- **切换工作目录**：`working_directory({ cd: 'docs' })` 切换后，程序内 `process.cwd()` 与后续相对路径都跟着变；不传参数只读当前目录
- **系统命令**：**`child_process` 直接可用**——`spawn` / `exec` / `execFile` 可以跑 cmd、PowerShell、编译（csc）、git 等任何本机程序（实测：写标记文件、跑 PowerShell 全部成功）。**需要跑命令时，可以写进程序**——复合任务（读文件 + 跑命令 + 汇总）在程序里一次做完
- **TypeScript 全语法**：运行时 `enum` / namespace 都支持（实测通过）。**但需要 ptc-plus >= 0.5.1**——0.5.0 在 dsh 0.2.1 下工具描述会退化成"仅可擦除语法"，实测虽然能跑，但模型看描述会不敢用
- 值传递增强：`undefined` / BigInt / NaN 等可直接返回——不过返回值保持干净 JSON 的习惯仍无害

单发命令仍走直通更快（程序基础启动约 0.7 秒且多一跳，直通近即时）；**批量 + 复合任务才写程序**——这个分界没变，只是"复合"的空间变大了。

### 参数约定

- 四个 `ops_*` 文件工具都以会话 cwd 为基准解析相对路径，只接受一个 `path`，**没有** `root` / `cwd` / `file_path` 别名；跨目录读取用绝对路径没问题。程序里调 `working_directory({ cd })` 会改变这个基准（`process.cwd()` 同步变）
- `edit` / `write` 的参数按 `file_path` 在前的顺序给（新版声明里明确要求，`content` / `old_string` / `new_string` 跟在后面）
- `ops_glob` 与 `ops_grep` 不遍历符号链接、重解析点、隐藏文件和 `.git`
- `ops_grep` 的 `pattern` 是 **Rust 正则**（且是字符串不是数组）；`ops_glob` 的 `pattern` 才是数组
- `ops_replace` 的 `dryRun` 只观察不落盘；真正写入使用内容 revision 校验与原子替换

### 返回形状（实测）

- `ops_glob` → `{ status, items, matched, total, nextOffset, truncated, ... }`；`items` 元素含 `path`（带平台分隔符）
- `ops_grep` → 统一信封 + `items`；`outputMode: 'count'` 时 `items: [{ count, path }]`，其它模式逐 mode 变化
- `ops_inspect_local_file` → `items: [{ line, path, text }]`。**注意别和 dsh 自带 `read` 混**：`read` 返回 `{ path, offset, lines: [{ number, text }], totalLines }`，两者形状不同
- 所有 `ops_*` 都带统一信封（`status` / `phase` / `matched` / `omitted` / `truncated` / `nextOffset`），超出上限用 `nextOffset` 分页；`status: "rejected"` 表示被策略层拦下，`error.code` 给原因

### 输出卫生

返回值走 JSON 序列化，**只要有一个 `undefined` 属性，整个程序就失败**，报 `invalid-output: program completion must be lossless JSON`——此时程序其实已经跑完了，死在最后一步。别猜哪个字段可能是 undefined，直接过一遍清理：

```js
const clean = (v) => {
  if (v === undefined) return null
  if (Array.isArray(v)) return v.map(clean)
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = clean(v[k]); return o }
  return v
}
return clean({ ... })
```

## 写操作的习惯

`ops_replace` 支持 `dryRun`：**先预演看影响面，再真正落盘**。这不是硬性护栏，是习惯。

## 排错

程序失败时结果里会带 `--- 诊断 ---` 段，里面是 dsh 侧的原始报错。常见几类：

- `invalid-output: program completion must be lossless JSON`：返回值里有 `undefined`，见"输出卫生"
- `POLICY_DENIED`：参数或路径不合规（dsh-ops 的前置检查）
- `PTY owner`：用了 `pwsh` —— 它是需要注册终端的**工具**，本架构（零 agent）下不可用。要跑 PowerShell 就在程序里用 `child_process`（`execFile` + 绝对路径）
- `worker-exit`：PTC 子进程异常终止，通常意味着沙箱配置被改动过——**不要**把 `profile/cordis.patch.yml` 里的沙箱模式改成 `workspace-write` 或 `read-only`，实测会让整条链路不可用（见 `docs/adr/0004-danger-full-access-on-windows.md`）

## dsh 升级后的维护

dsh 桌面应用升级后，插件和工具声明都可能跟着变。按顺序过一遍：

1. **升级插件**。`dsh plugin --profile wbptc outdated` 空输出**不代表最新**——pnpm 对 semver 范围内的新版本不报告。直接读实际版本：

   ```sh
   node -p "require('./.dsh-home/profiles/wbptc/node_modules/dsh-ptc-plus/package.json').version"
   ```

   落后就重跑 `bash scripts/setup.sh`（会自动升级），或手动 `DSH_HOME=<仓库>/.dsh-home dsh plugin --profile wbptc add dsh-ptc-plus@<版本>`。

2. **重新生成工具声明**：`bash scripts/describe-tools.sh`。它会重打 dsh-ops 的 schema 补丁、生成 `mcp/tools-sdk.md`，`ops_*` 被降级成 `unknown` 时直接失败。

3. **核对描述有没有退化**。这是最隐蔽的坑：`run_code` 的描述可能回退成内核默认的 "erasable syntax only — no enum or namespaces"，而实际执行能力还在——**描述骗模型比能力缺失更常见**。看 `mcp/tools-sdk.md` 第 3 行，应该是 "PTC Plus TypeScript cell (runtime `enum` and namespaces are supported)"。

4. **跑全量回归**：`bash scripts/check.sh`，含插件版本断言、模型行禁用、tools 处于 ptc 模式。

5. **实跑能力**：`bash scripts/dsh.sh --profile wbptc examples/06-program-shell.ts`，三个 marker 全 `true`。

**两个坑**：`setup.sh` 里读版本不能用 MSYS 绝对路径（`/d/...`），Node 的 `require` 在 Windows 上解析不了，会 fallback 成 `0.0.0`；桌面应用的 profile（`~/.dsh`）和项目的 `.dsh-home` **互不影响**，要更新桌面得单独跑 `dsh plugin --profile desktop add ...`，升级前先备份 `package.json` 和 `pnpm-lock.yaml`。
