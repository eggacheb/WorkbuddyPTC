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

## 入口插件的位置

`runner/index.js` 由 `scripts/deploy.sh` 拷到 profile 目录旁边，patch 行用相对名 `./runner/index.js` 引用——DSH 的载荷约定是"相对插件的名字按相对本 patch 文件解析"，所以**不需要 pnpm 安装**。（试过 `dsh plugin add` 走 `link:`，跨盘解析不通，已放弃。）

## 怎么确认没花钱

```sh
grep -o '"debitUnits":[0-9]*' ~/.dsh/.dshw-usage.json
```

这是 DSH 桌面应用的消费台账，跑完前后应该都是 `0`。这三层同时成立才叫安全：配置层（provider 行 disabled）、环境层（`scripts/dsh.sh` 抹掉 API 凭据）、目录层（隔离的 `DSH_HOME`，没有凭证文件）。
