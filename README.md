# WorkbuddyPTC

**WorkBuddy 出模型，dsh 出执行。** WorkBuddy 把一批文件操作写成一段 TypeScript 程序，交给 DeepSeek Harness（dsh）的 PTC 运行时一次跑完——只有最终结果回到对话，中间过程一条都不进。

## 三条底线（都已实测验证）

| 底线 | 机制 |
| --- | --- |
| **不花钱** | wbptc profile 里所有能走到 API 的行都是 `disabled`；独立的 `DSH_HOME`，不放任何凭证 |
| **不碰桌面应用** | 隔离在仓库内的 `.dsh-home/`，绝不读写 `~/.dsh`（ADR-0003） |
| **不占模型往返** | 程序与工具调用在 dsh 进程内闭环，中间结果不出门 |

## 快速开始

前置：DeepSeek Harness 桌面应用已安装（本项目用它的运行时，但不碰它的配置目录）。

```sh
# 1. 建 profile（首次）
bash scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config

# 2. 装 dsh-ops 插件（首次）
bash scripts/dsh.sh plugin --profile wbptc add dsh-ops

# 3. 部署 + 生成工具声明（含 schema 补丁）
bash scripts/describe-tools.sh

# 4. 回归检查（应全绿）
bash scripts/check.sh

# 5. 跑第一段程序
bash scripts/dsh.sh --profile wbptc examples/01-arithmetic.ts
```

WorkBuddy 侧的接入口（MCP server + 技能）配置与激活流程见 [`docs/running.md`](docs/running.md)。

## 日常怎么用

在 WorkBuddy 对话里直接说任务，不需要指定工具：

> 把 docs 下所有 markdown 的标题和行数列成一张表

模型判断需要批量操作时，会自动写一段程序交到这里执行；单发的读、改、命令走直通，不经过本项目。

## 已知限制

- **程序里没有 shell**：`pwsh` / `ops_bash` 需要 dsh 的 agent 生态，而本项目是刻意的零 agent 架构（ADR-0001）。需要跑命令时由 WorkBuddy 直通执行。
- **单发操作不适合走程序**：一次执行要启动一遍运行时（实测 0.9–3 秒），两种调用约定并存是设计，不是缺陷（ADR-0002）。
- **沙箱是全开的**：Windows + dsh 0.2.0-rc.2 上任何 OS 级 confinement 都会打死 PTC 子进程（ADR-0004）。不要把它改回 `workspace-write`。

## 文档

| 文档 | 内容 |
| --- | --- |
| [`docs/running.md`](docs/running.md) | 构建、运行、验证、MCP 激活流程 |
| [`docs/adr/`](docs/adr/) | 5 份决策记录：为什么这么设计 |
| [`skill/SKILL.md`](skill/SKILL.md) | 给模型的 PTC 使用说明（已装到 `~/.workbuddy/skills/wbptc/`） |
| [`mcp/tools-sdk.md`](mcp/tools-sdk.md) | 程序里可用的工具签名（生成物，不要手改） |
| [`GLOSSARY.md`](GLOSSARY.md) | 术语文档 |

## 架构一瞥

```
你 → WorkBuddy 模型 ──批量──→ run_program（MCP）→ dsh PTC 运行时 → 结果
                    └──单发──→ 直接执行（不经过本项目）
```

零 agent 架构：不挂 dsh 的模型、不建会话、不跑 agent 循环——这是「不花钱」三层保险的地基（ADR-0001）。
