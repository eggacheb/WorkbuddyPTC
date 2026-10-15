# 怎么跑

本项目的运行形态：**WorkBuddy 出模型，dsh 出执行与工具**（见 ADR-0001）。

## 前置

- DeepSeek Harness 桌面应用已安装（本项目用它的运行时，但**不碰**它的 `~/.dsh`，见 ADR-0003）
- 项目的 `DSH_HOME` 是仓库内的 `.dsh-home/`，已在 `.gitignore` 里

## 三条命令

```sh
# 1. 首次：从 sdk-minimal 模板建 profile（可重复执行，会重置该 profile）
bash scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config

# 2. 每次改了 profile/ 或 runner/ 之后：部署进去
bash scripts/deploy.sh

# 3. 跑一段程序
bash scripts/dsh.sh --profile wbptc examples/01-arithmetic.ts
```

第 3 条会打印程序 `return` 的值。程序是 **TypeScript 的 async 函数体**，可以用顶层 `await` 和 `return`。

## 校验（都不启动、不联网）

```sh
# 看组合树：确认模型侧的行都是 disabled: true
bash scripts/dsh.sh --profile wbptc --dump-config | grep -B2 "disabled: true"
```

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

它以 `dsh.bundle.patch` 声明自己是个 bundle 层，装完自动参与组合。四个组件里 `shell` 与 `file` 默认开启；`ptc`（`ops_batch` / `ops_result`）默认关闭且要求"纯 PTC 会话"——我们这套不是，所以那两个批处理工具目前拿不到。

程序里可用的工具（`TOOL_PREFIX = 'ops_'`）：

| 工具 | 用途 |
| --- | --- |
| `ops_glob` | 多模式找路径，支持排除 |
| `ops_grep` | Rust 正则搜索，支持 count / summary |
| `ops_inspect_local_file` | 批量文本范围、编码、PDF 文本、hex |
| `ops_replace` | 跨文件批量替换（`dryRun` 先看） |
| `ops_bash` | 优先的 bash 执行器 |

## 会话身份

`run_code` 的桥会调 `agent.session.append(...)`，dsh-ops 的文件工具会读 `session.id` 与 `session.header.cwd`。所以 runner 必须传一个**真的 `Session` 实例**（不是字面量对象）；构造方式取自 DSH 自己的测试 `packages/boot/plugin-manager/tests/tools.spec.ts`。这个 Session 不挂 agent-loop、不追加任何事件到真实会话日志、不参与任何模型调用。

## 入口插件的位置

`runner/index.js` 由 `scripts/deploy.sh` 拷到 profile 目录旁边，patch 行用相对名 `./runner/index.js` 引用——DSH 的载荷约定是"相对插件的名字按相对本 patch 文件解析"，所以**不需要 pnpm 安装**。（试过 `dsh plugin add` 走 `link:`，跨盘解析不通，已放弃。）

## 怎么确认没花钱

```sh
grep -o '"debitUnits":[0-9]*' ~/.dsh/.dshw-usage.json
```

这是 DSH 桌面应用的消费台账，跑完前后应该都是 `0`。这三层同时成立才叫安全：配置层（provider 行 disabled）、环境层（`scripts/dsh.sh` 抹掉 API 凭据）、目录层（隔离的 `DSH_HOME`，没有凭证文件）。
