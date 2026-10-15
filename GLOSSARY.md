# WorkbuddyPTC

让 WorkBuddy 用上 PTC 模式的工程项目。本术语表记录本项目使用的词汇，以及被明确排除的同义词。

## Language

**PTC (Programmatic Tool Calling)**:
一种 Agent 运行模式：宿主只向模型暴露**一个**保留工具 `run_code`，同时把可用工具的签名生成成一段类型声明放进系统提示；模型据此写一段程序批量调用工具，程序在本地执行，中间值留在执行内，只有最终结果回到模型上下文。
_Avoid_: Code mode（DSH 早期版本的旧名）, 代码模式

**DSH (DeepSeek Harness)**:
DeepSeek 官方开源的 Agent harness（`github.com/deepseek-ai/deepseek-harness`）。PTC 是它的四种 Agent 预设之一，本项目移植其机制的来源。
_Avoid_: harness（单说时歧义，见下条）

**Agent 预设 (Agent preset)**:
DSH 中一套声明式的运行配置，由 `plugins` 列表决定加载哪些子插件（工具、提示段、技能）。DSH 随发行版自带四个，稳定 id 为 `standard`、`ptc`、`minimal`、`cordis`。
_Avoid_: 模式（太泛）, Creator、code（那是显示名或错误 id，不是稳定 id）

**harness**:
承载 Agent 循环的宿主程序。本项目同时涉及两个 harness：DSH（机制来源）与 WorkBuddy（移植目标）。单说「harness」时必须指明是哪一个。
_Avoid_: 框架, 外壳

**run_code**:
PTC 模式下唯一的 wire 工具，参数为 `code` 与 `description`，其中 `code` 是 TypeScript 的 async 函数体。返回值形状为 `{ logs: string[], result?: JsonValue }`。它是 PTC 最可移植的那一层。
_Avoid_: execute_code, code_runner, 代码执行工具

**直通调用 (native call)**:
一次调用一个工具，由模型逐步驱动。编码工作里最常见的单步操作（读一个文件、改一处、跑一条命令）用它最合适。
_Avoid_: 原生模式、普通调用、native 模式

**程序化调用 (programmatic call)**:
模型写一段程序，把多步、需循环或需分支的工具调用在一次执行里做完，中间态不回上下文。**只用于批量的活**；给单步操作用它是上税。
_Avoid_: 全程 PTC、PTC 模式（指代不清，见下条）

**「全程用 PTC」**:
本项目里的一个**禁用说法**。它同时可以指"每个动作都写成程序"和"这条通道全程可用"，而这两者差别巨大。要说清楚是哪一个：前者本项目**不做**（见 ADR-0002），后者是说这条通道一直开着。
_Avoid_: 全程 PTC、从头到尾都用 PTC

**工具绑定 (tool binding)**:
执行环境中注入的全局对象（DSH 中名为 `tools`），每个成员是一个 async 函数，对应一个可用工具。程序里的 `await tools.foo(args)` 走**独立控制通道**回调宿主执行，不占用模型往返。
_Avoid_: 工具代理, capability

**SDK 声明 (sdk declaration)**:
宿主由工具 JSON Schema 生成的一段 `.d.ts` 文本，放在系统提示里，让模型知道有哪些工具、签名如何。**它不是 npm 包，也没有 import**；类型是提示性的，运行时执行前会剥离类型。
_Avoid_: TypeScript SDK（容易误读成要安装的依赖）, 类型定义
