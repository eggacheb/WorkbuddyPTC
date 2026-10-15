# 怎么跑

本项目的运行形态：**WorkBuddy 出模型，dsh 出执行与工具**（见 ADR-0001）。

两种用法：**让 WorkBuddy 用**（主线，走 MCP）和**手动跑一个程序**（调试用）。

## A. 让 WorkBuddy 用

三样东西，各自的位置：

| 部件 | 位置 | 作用 |
| --- | --- | --- |
| MCP server | `mcp/server.js`，注册在 `~/.workbuddy/mcp.json` | 暴露 `run_program` 工具 |
| 工具声明 | `mcp/tools-sdk.md`（生成物，已提交） | 模型读它才知道有哪些工具、什么签名 |
| 技能 | `skill/SKILL.md`，已装到 `~/.workbuddy/skills/wbptc/` | 告诉模型什么时候该写程序、什么时候照旧直通调用 |

**桌面应用不需要保持运行。** 2026-10-15 实测：桌面应用完全关闭（零进程）后跑 PTC 程序——`1+1=2`、`ops_glob` 找到文件、985ms 正常返回，且执行进程跑完即退、不留驻留。原因：`dsh.cmd` 是独立启动器，每次调用以 `ELECTRON_RUN_AS_NODE=1` 模式**临时启动一个 `DeepSeek Harness.exe` 新实例**（无窗口、不连接已运行的 GUI）。两者唯一共享的是磁盘上的安装文件——升级或卸载 dsh 后跑一次 `scripts/check.sh` 即可。

改了 `skill/` 或 `mcp/server.js` 之后要同步出去：

```sh
cp skill/SKILL.md ~/.workbuddy/skills/wbptc/SKILL.md
```

`~/.workbuddy/mcp.json` 里的配置由脚本自动写入（`setup.sh` 会调用它，也可单独跑）：

```sh
node scripts/install-mcp.mjs           # 写入（写前自动备份原文件）
node scripts/install-mcp.mjs --print   # 只预览将写入的内容，不动文件
```

它按当前机器动态生成所有路径（node、仓库位置、dsh），所以仓库放哪都行；写入是**合并式**的——只覆盖 `wbptc` 这一个键，其他 MCP 条目原样保留。生成的条目形如：

```json
{ "mcpServers": { "wbptc": {
    "type": "stdio",
    "command": "C:\\Program Files\\nodejs\\node.exe",
    "args": ["D:\\code\\WorkbuddyPTC\\mcp\\server.js"],
    "env": { "DSH_BIN": "C:\\Users\\...\\dsh.cmd" }
} } }
```

### 激活流程（容易卡住的地方）

**`type: "stdio"` 不能省。** WorkBuddy 自带的官方插件 `.mcp.json`（例如 `plugins/cache/workbuddy-builtin/mcp-miora/*/.mcp.json`）用的就是 `type` + `command` + `args` 这一组字段，照它写最稳。

写入文件之后**不会自动生效**，而且**外部直接改文件时应用可能不会刷新它自己的列表**——因为应用是通过「自定义连接器」页里的「配置 MCP」按钮打开的**内置编辑器**读写这份文件的。所以：

1. 打开 WorkBuddy → 侧边栏「专家·技能·连接器」→「连接器」
2. **完全重启 WorkBuddy**（2026-10-15 实测：写文件后不重启，列表里不出现；重启后出现）
3. 页面右上角「自定义连接器」→「MCP 服务管理」，点「**信任**」

若重启后仍不出现，再用「**配置 MCP**」打开内置编辑器确认 `wbptc` 在不在里面——应用是通过这个编辑器读写该文件的，外部直接改文件时它的内存态不会刷新。

排查时可以先自己确认 server 那边没问题（它连空环境都能起来）：

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}\n' \
  | "/c/Program Files/nodejs/node.exe" mcp/server.js
```

### 首次端到端验证（2026-10-15，重启 + 信任之后）

从 WorkBuddy 会话内直接调用 `run_program` 做仓库盘点：28 个文件按目录归类、`ops_grep` 计数、`ops_inspect_local_file` 跨盘读取（`C:/Users/...`）——861–3029ms 返回，台账 `debitUnits` 全程为 0。

同时暴露了三个使用边界，都已写进 `skill/SKILL.md`：

- **返回值必须是严格无损 JSON**：任何 `undefined` 属性都报 `invalid-output: program completion must be lossless JSON`，整个程序算失败（其实已经跑完了，死在最后序列化那步）。属性值可能缺失时用清理函数过一遍
- **没有 shell**：`pwsh` 在绑定里但执行必失败（`agent "undefined" is not the registered PTY owner`）；`ops_bash` 未注册。**命令类操作直通调用宿主工具，不要写进程序**
- `ops_inspect_local_file` 返回 `items: [{ line, path, text }]`，和 dsh 自带 `read` 的 `lines: [{ number, text }]` 形状不同，别混

## B. 手动跑一个程序（调试用）

```sh
bash scripts/dsh.sh --profile wbptc examples/03-batch-scan.ts
```

## 构建流程

**首次部署（新机器）用一键脚本，幂等可重复运行：**

```sh
bash scripts/setup.sh
# = 检查前置 → 建 profile → 装 dsh-ops → 部署 + 生成声明 → 回归检查 → 写 MCP 配置 + 装技能
```

日常维护的分步命令：

```sh
# 1. 首次：从 sdk-minimal 模板建 profile
bash scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config

# 2. 装 dsh-ops（只需一次）
bash scripts/dsh.sh plugin --profile wbptc add dsh-ops

# 3. 每次改了 profile/ 或 runner/ 之后
bash scripts/deploy.sh

# 4. 改了 profile 之后重新生成给模型看的工具声明
bash scripts/describe-tools.sh
```

第 4 步里含一个**对第三方包的补丁**：dsh-ops 的工具 schema 用了 DSH 不支持的 `minimum`/`maximum`/`minItems`，会让 `ops_*` 的参数类型整体降级成 `unknown`。补丁去掉它们，脚本末尾有断言防止 dsh-ops 升级后静默退化。原因与取舍见 `docs/adr/0005-patch-dsh-ops-schema.md`。

## 校验

```sh
# 一键回归：静态（部署同步 + 语法）+ 需要 dsh 的部分（模型行、ptc 模式、unknown 断言），约 5 秒
bash scripts/check.sh

# 只跑静态部分（pre-commit 钩子用的就是它，毫秒级）
bash scripts/check.sh --static

# 手动看组合树（check.sh 已包含这一步）
bash scripts/dsh.sh --profile wbptc --dump-config | grep -B2 "disabled: true"
```

新 clone 或新机器上，启用 pre-commit 钩子（仓库级配置，只对本仓库生效）：

```sh
git config core.hooksPath .githooks
```

`check.sh` 里有一条刻意的设计：**台账 `debitUnits` 只展示、不断言**——你平时自己用 dsh 桌面应用时消费是正常的，把它写成断言是好心的错误检查。唯一能做硬断言的是「模型行被禁用」——它让消费在代码路径上不可能。

## 两个踩过的坑

**1. 禁用要连坐。** `session-log-deepseek` 与 `plugin-package-inventory-deepseek` 唯一的依赖是被关掉的 `deepseek-llm-api-extensions`，不一起关掉会在启动时报 `pending (waiting for service)`。

**2. `sdk-app` 的命令行是"零位置参数"语法。** 它建的是 zero-option command，会把传给 runner 的程序路径直接拒掉（`too many arguments. Expected 0 arguments`）。我们不使用 SDK 的 JSON-RPC 服务，所以 `sdk-app-startup` 与 `sdk-jsonrpc-server` 都已禁用。`appReady` / `appExit` 由 launcher 提供，与这两个插件无关。

## 环境变量

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `WBPTC_WORKSPACE` | 程序文件所在目录 | 沙箱作用根，同时作为会话 cwd。dsh-ops 的文件工具以它为基准解析相对路径 |
| `WBPTC_SANDBOX` | `danger-full-access` | 沙箱模式覆盖，用于回归与上游修复后的重测（见下） |

## 沙箱：为什么默认是全开

三种模式**本机实测**结果：

| 模式 | PTC 子进程 | 说明 |
| --- | --- | --- |
| `read-only` | ❌ 崩溃 | `worker-exit`，`ICU data` 错误，`enforcement: partial` |
| `workspace-write` | ❌ 崩溃 | 同上 |
| `danger-full-access` | ✅ 正常 | `enforcement: policy`，`boundary: trusted-native-file-operations` |

**任何 OS 级 confinement 都会打死 PTC 的 Node 子进程。** 这是 DSH 0.2.0-rc.2 + Windows 的上游限制，不是本项目引入的。

**因此默认是全开，程序本身没有 OS 级文件兜底——这是实测结论，不是疏漏。** 完整的取舍理由与"不要把它改成 workspace-write"的告诫见 `docs/adr/0004-danger-full-access-on-windows.md`。

回归方式（预期是 `worker-exit`）：

```sh
WBPTC_SANDBOX=workspace-write bash scripts/dsh.sh --profile wbptc examples/03-batch-scan.ts
```

约束模型：**程序是可信的（我们自己写的）+ 工具层做策略检查 + 没有 OS 兜底**——与 WorkBuddy 自己调 Bash 是同一层信任。写操作的习惯：先 `dryRun` 看影响面再落盘（`ops_replace` 原生支持，见 `examples/04-write.ts`）。

## dsh-ops

已装进 profile：

```sh
bash scripts/dsh.sh plugin --profile wbptc add dsh-ops
```

它以 `dsh.bundle.patch` 声明自己是个 bundle 层，装完自动参与组合。四个组件的实际账面：

- **`file`** —— ✅ **生效，是 PTC 程序的主力**。四个 `ops_*` 工具就是它（见下表）。
- **`shell`** —— 装了、但 bash 工具不注册（原因见下）。
- **`ptc`**（`ops_batch` / `ops_result`）—— **启用也拿不到**。2026-10-15 实测：改成 `disabled: false` 后启动零警告、工具零注册——它的 `attach()` 只监听 `agent/created` 事件，`ptcOnly()` 第一句就要求 `agent.ctx`（`lib/ptc/index.js`），零 agent 架构下它只会静默空转。所以 profile 里保持它关闭，并把原因写在 `profile/cordis.patch.yml` 里（将来若放宽零 agent 的决定，改一行并跑 `scripts/check.sh` 即可重测）。
- **`background`** —— 默认关闭，未启用。

程序里可用的工具（`TOOL_PREFIX = 'ops_'`）：

| 工具 | 用途 |
| --- | --- |
| `ops_glob` | 多模式找路径，支持排除 |
| `ops_grep` | Rust 正则搜索，支持 count / summary |
| `ops_inspect_local_file` | 批量文本范围、编码、PDF 文本、hex |
| `ops_replace` | 跨文件批量替换（`dryRun` 先看） |
| ~~`ops_bash`~~ | **不可用**，见下 |

**`ops_bash` 的缺席是架构性的，不是配置问题。** dsh-ops 只在 `agent/created` 事件上发布 bash 工具，并要求 agent 自带 Cordis fiber（`lib/session-shells.js` 的 `attach()`）。本项目是无 agent 架构（ADR-0001），没有 agents 注册表，它永远不会注册。同理 `pwsh` 虽在绑定里，执行必失败（PTY owner 检查同样要求 agents 注册表）。**要跑命令（git、构建、脚本）就在会话里直通调用宿主工具**，这正落在 ADR-0002 的第二种约定上。

## 会话身份

`run_code` 的桥会调 `agent.session.append(...)`，dsh-ops 的文件工具会读 `session.id` 与 `session.header.cwd`。所以 runner 必须传一个**真的 `Session` 实例**（不是字面量对象）；构造方式取自 DSH 自己的测试 `packages/boot/plugin-manager/tests/tools.spec.ts`。这个 Session 不挂 agent-loop、不追加任何事件到真实会话日志、不参与任何模型调用。

## 入口插件的位置

`runner/index.js` 由 `scripts/deploy.sh` 拷到 profile 目录旁边，patch 行用相对名 `./runner/index.js` 引用——DSH 的载荷约定是"相对插件的名字按相对本 patch 文件解析"，所以**不需要 pnpm 安装**。（试过 `dsh plugin add` 走 `link:`，跨盘解析不通，已放弃。）

## 怎么确认没花钱

```sh
grep -o '"debitUnits":[0-9]*' ~/.dsh/.dshw-usage.json
```

这是 DSH 桌面应用的消费台账，跑完前后应该都是 `0`。这三层同时成立才叫安全：配置层（provider 行 disabled）、环境层（`scripts/dsh.sh` 抹掉 API 凭据）、目录层（隔离的 `DSH_HOME`，没有凭证文件）。
