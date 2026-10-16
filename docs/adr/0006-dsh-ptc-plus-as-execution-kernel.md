# ADR-0006：采用 dsh-ptc-plus 作为执行内核

日期：2026-10-16
状态：已采纳

## 背景

原版 `@deepseek-ai/dsh-ptc-runtime-node` 主动阻止 PTC 程序创建子进程（实测：spawn 返回假进程、零磁盘副作用、手动补齐环境无效——五轮探测见 `examples/06-program-shell.ts`）。这使 WorkBuddy 侧的 PTC 程序**没有系统命令能力**：无法跑 git、编译、脚本——复合任务（读文件 + 跑命令 + 汇总）必须拆成"程序 + 直通"两段。

而用户在 dsh 桌面端使用的 PTC（装了 `dsh-ptc-plus`，第三方会话级 REPL）**没有这条限制**——真实会话记录（session-08fbdfbf）显示程序直接跑 PowerShell、编译 C#、读注册表、生成图标。用户希望 WorkBuddy 侧获得同等形态。

## 决策

**采用 `dsh-ptc-plus`（npm，MIT）作为 wbptc profile 的执行内核**，替代原版 ptc-runtime-node。它通过 `dsh.bundle.patch` 正常接入（isolate 原执行行 + 接管 `ptcRuntime` 服务名），对消费方透明。

接入需要六个适配点（完整细节在 `profile/cordis.patch.yml`、`runner/index.js` 及 `docs/running.md` 的对应小节）：

1. 原执行行 id 对齐官方命名 `ptc-runtime`
2. 该行携带 isolate 声明（插件激活的前置检查）
3. 补 `session-query-sqlite` 服务（插件读会话事件流所需，dsh-base 标准件）
4. runner 会话改经 `sessions.create()` 创建（进 store，才能被会话查询观察到）
5. agent 挂作用域 ctx（插件向 agent 作用域注册 `edit_run_code`）
6. describe-tools 断言收紧（避免 ptc-plus 合法 `unknown` 误报）

## 为什么不自己实现

- 进程能力解锁需要替换执行内核的**运行时机制**（env 构建、spawn 路径、kernel 生命周期），不是配置开关；重新实现等于重写数百个模块的编译/绑定/容错层
- dsh-ptc-plus 已在用户桌面端充分运行（0.4.8，194 次提交、8 个月迭代），且为"无 agent 场景"做了代码级容错（`ctx.agents?.list?.() ?? []` 等可选链）
- 装上即可用：六小时内从"评估"到"全绿"（当日 19/19 + 进程标记全部通过；回归项后来增至 21）

## 代价与边界（接受）

| 项 | 变化 | 评估 |
| --- | --- | --- |
| 启动开销 | 约 0.9–3 秒 → **约 9 秒** | 接受。复合任务一次做完仍远优于多轮直通；单发操作继续直通 |
| 程序能力 | 无命令 → **完整 child_process** | 接受。与 WorkBuddy 直通 Bash 同一层信任；沙箱仍为 danger-full-access（ADR-0004） |
| 会话真实性 | detached 实例 → **真会话**（sessions.create、session-query 服务） | 接受。会话不调模型、不涉网络；数据落在隔离的 `.dsh-home/` |
| 第三方依赖 | 新增 16 个 npm 包 | 接受。MIT、可回滚（卸载后 runner 自动降级到手工会话） |
| 维护面 | 两处适配点可能在插件升级时失效 | 缓解：适配点全部带注释写明原因；check.sh + examples/06 是回归入口 |

> **2026-10-16 同日复测更正**：上表「约 9 秒」是决策当日的粗口径——它把一次**完整任务**的
> 耗时当成了启动开销。同日更精确的测量（写在 `docs/running.md` 的「代价与边界」小节）：
> **基础启动约 0.7 秒**（672–735ms，与原版内核相当）；批量文件操作（7 个调用）约 4.2 秒；
> 含 3 条命令的复合任务约 8.4 秒。**「复合任务一次做完依然划算、单发操作继续直通」的结论不变。**

**与 ADR-0001 的一致性**：「不花钱」三层保险（llm 行禁用、无凭据、脚本路径无模型）未受影响——本次变更引入的会话与 REPL 内核均无模型调用路径（dsh-llm 仅为消息构造工具函数的依赖，代码级确认）。"零 agent"的表述微调为：**服务在、实例不在**（`agents: []`），且不运行 agent 循环。

## 验证方式

```sh
bash scripts/check.sh                                              # 全绿（当日 19 项 → 现 21 项）
bash scripts/dsh.sh --profile wbptc examples/06-program-shell.ts   # 三个 marker: true
```
