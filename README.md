# WorkbuddyPTC

**让 WorkBuddy 一次处理一批文件——批量阅读、批量修改，不再一个一个来。**

## 它帮你干什么

平时让 WorkBuddy 处理稍微多一点的文件，它只能一个一个来：每读一个文件、每改一处内容，对话里就多记一笔。文件一多，对话变得又长又慢，它的表现也开始下降。

这个项目给它换了一种干法：**把整批操作写成一段小程序，交给一个本地执行器一口气跑完。** 中间过程（翻过哪些文件、试了什么、命令输出）全部不进对话——只有最终结果回来。

具体是三类活：

### 一、批量阅读

> 「把 docs 里所有文章的标题、行数、最后修改时间列成一张表。」

- 普通做法：打开第一个文件 → 记录 → 打开第二个 → 记录…… 十几个文件就是十几轮，中间过程塞满对话
- 用这个：**一次执行全部读完**，直接给你一张表

同类例子：

- 「统计每个文件里有多少个 TODO，按数量排序」
- 「读一遍所有配置文件，列出每个服务用了哪些端口」
- 「找出所有超过 100 行的文件」

### 二、批量修改

> 「把全项目所有文档里的 `old-name` 批量改成 `new-name`。」

- 普通做法：一个文件一个文件地读、改、写，来回几十轮
- 用这个：**程序扫全项目、逐处替换**，返回一份改动清单。支持先"预演"（看会改哪些地方、命中几处），确认后再真正执行

同类例子：

- 「把所有 markdown 里的日期格式统一成 2026-10-16 这种」
- 「把代码文件里的英文注释都翻译成中文」（读 + 写）
- 「给所有 .md 文件里的链接补上相对路径」

### 三、读、改、命令，混着来

> 「跑一遍测试，把失败的用例和报错日志收集起来，整理成一份 markdown 报告。」

程序里既能读写文件，也能跑系统命令（git、构建脚本、PowerShell）——混在一起，一次执行做完。

## 效果有多直接

一次真实任务的对照（数据来自本仓库的实测）：

| 任务 | 程序内部实际动作 | 对话里的往返 | 耗时 |
| --- | --- | --- | --- |
| 简单计算 | 无 | 1 次 | 约 0.7 秒 |
| 批量阅读 | 1 次找文件 + 20 次并行读文件 + 1 次内容检索 | 1 次 | 约 4 秒 |
| 复合任务 | 3 条系统命令 + 文件操作 | 1 次 | 约 8 秒 |

**关键在第二、三列：无论程序内部做多少次操作，对话里永远只占 1 次往返。**

三个直接效果：

- **对话不再被中间过程撑爆** —— 聊得再久也不"变笨"
- **一批活从"几十轮来回"变成"一次执行"**
- **全程本机执行，不调用任何 AI 模型，零 API 花费**

背后的执行内核来自 DeepSeek Harness（一个开源项目），但对使用者完全透明——你不需要了解它。

## 开始前，你需要有

| 需要什么 | 怎么获得 |
| --- | --- |
| 一台 Windows 电脑（64 位） | 本项目目前只支持 Windows |
| **DeepSeek Harness 桌面应用** | 从 <https://github.com/deepseek-ai/deepseek-harness> 获取并安装。本项目只使用它的执行部件，**不会动它的任何设置**，安装后也不需要让它保持运行 |
| **Node.js** | <https://nodejs.org> 下载 LTS 版，安装时全部默认选项 |
| **Git**（自带 Git Bash） | <https://git-scm.com> 下载安装，用来运行部署命令 |
| WorkBuddy | 你已经有了 |

## 部署（三步）

### 第 1 步：下载项目

打开 **Git Bash**（开始菜单搜索 "Git Bash"；还没装 Git 的话先看上面的前提表格），运行：

```sh
git clone https://github.com/eggacheb/WorkbuddyPTC.git /d/code/WorkbuddyPTC
```

这会把项目下载到 `D:\code\WorkbuddyPTC`。说明：

- Git Bash 里 `/d/code/` 就是 D 盘的 `\code\` 文件夹——想放到别处，改这段路径即可（建议用纯英文路径）
- 如果下载很慢，多半是网络问题，换个时间重试即可

### 第 2 步：一键部署

继续在 Git Bash 里运行：

```sh
cd /d/code/WorkbuddyPTC      # ← 换成你实际下载的位置
bash scripts/setup.sh
```

脚本会逐条打印进度，自动完成所有安装。最后看到这段就是成功：

```
=============================================
 全部就绪。还剩两步（一次性，人工完成）：
 ...
=============================================
```

中途报错的话，跳到下面的「出问题怎么办」。

### 第 3 步：在 WorkBuddy 里点一下「信任」

1. **完全**退出 WorkBuddy，再重新打开（"完全"＝任务栏/托盘图标也要退出，配置在重启后才生效）
2. 侧边栏 →「连接器」→ 右上角「自定义连接器」→ MCP 服务管理
3. 在列表里找到 **wbptc**，点「信任」

## 验证成功

在 WorkBuddy 里新开一个对话，说：

> 用 run_program 算一下 1 + 1

它执行后返回 **2**，就是全部打通了。

（更贴近真实用途的验证：「把 docs 下所有 markdown 的标题列成一张表」）

## 日常怎么用

装好之后，什么都不用记。照常提要求即可：

> **批量阅读**：「找出所有超过 100 行的文件，按大小排个序」
> **批量修改**：「把 docs 里所有文章中的 old-name 改成 new-name」
> **混合任务**：「跑一遍 git log，按人汇总这周谁改了什么」

需要批量处理的活，WorkBuddy 会自动走这条快路；简单的读一个文件、改一行，照常直接做——**单发操作不走程序是故意的**（程序每次要从头启动一遍执行环境，为单个动作用它不划算）。**你不需要指定任何工具。**

**常见问题：DeepSeek Harness 桌面应用要一直开着吗？** 不用。WorkBuddy 干活时会自己临时启动一个后台实例，干完就退——实测在桌面应用完全关闭时照常工作。你想开就开、想关就关，互不影响。

## 出问题怎么办

| 现象 | 怎么办 |
| --- | --- |
| setup.sh 提示找不到 dsh | DeepSeek Harness 没装好，或装了非默认位置。装好后重试；也可以手动指定：`DSH_BIN=你的路径 bash scripts/setup.sh` |
| 重启后列表里还是没有 wbptc | 确认是"完全退出"WorkBuddy（任务栏/托盘图标也要退），再试一次 |
| 其他报错 | 在项目文件夹里运行 `bash scripts/check.sh`，把完整输出保存下来求助 |

## 安全吗

四条保证，都是实测验证过的：

- **不多花一分钱** —— 执行的程序不调用任何 AI 模型，执行环境里没有也不需要任何 API 凭据
- **不碰你的 DeepSeek Harness** —— 完全独立运行，不读也不写它自己的设置；桌面应用开不开都不影响
- **能力范围 = 你本机的手动操作** —— 程序能读写文件、能跑命令，就像你自己在电脑上操作一样；没有额外的联网上报、没有后台驻留
- **跑完即退** —— 每次执行起一个独立进程，结束就退，不留任何常驻

## 它站在谁的肩膀上

这个项目自己写的代码不多，能力主要来自这几个开源项目，在此致谢：

| 组件 | 作者 | 在这里的角色 | 许可证 |
| --- | --- | --- | --- |
| [**DeepSeek Harness**](https://github.com/deepseek-ai/deepseek-harness) | DeepSeek | 整个执行环境：PTC 机制、工具注册表、TypeScript 类型剥离、进程与沙箱管理 | MIT |
| [**dsh-ptc-plus**](https://github.com/muyuanjin/dsh-ptc-plus) | muyuanjin | 执行内核：把 `run_code` 升级为会话级 TypeScript REPL——程序里的系统命令能力、完整 TS 语法都来自它 | MIT |
| [**dsh-ops**](https://github.com/T-Auto/dsh-ops) | T-Auto | `ops_*` 文件工具（Rust 实现）：批量找文件、搜内容、读文件、批量替换，自带分页与预演 | MIT AND Apache-2.0 |
| [**MCP TypeScript SDK**](https://github.com/modelcontextprotocol/typescript-sdk) | MCP 社区 | WorkBuddy 与执行器之间的协议层 | MIT |

另外几件应该单独说的事：

- **dsh-ops 的测试工具**（`test/lib/host.mjs`）示范了官方的调用方式，帮本项目解决了"会话身份"这道坎；它硬性拒绝在真实 `DSH_HOME` 上运行的做法，与本项目 `scripts/dsh.sh` 的隔离守卫是同一思路——等于给我们的隔离设计背了书。
- **DeepSeek Harness 的设计文档**明确写着"无 agent 的直接执行照样能跑"（*Direct executions without an agent still run*）——本项目"零 agent 架构、不花一分钱"正建立在这条设计之上。
- **dsh-ops 的技术文档**如实标注了它自己的测量口径（而不是只宣传数字）——本项目引用它时因此少走了弯路，值得尊敬。

---

## 给维护者

### 部署命令（分步版）

`bash scripts/setup.sh` 是幂等的，可重复运行。它展开就是：

```sh
bash scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config  # 建 profile（首次）
bash scripts/dsh.sh plugin --profile wbptc add dsh-ops                                # 装 dsh-ops（首次）
bash scripts/dsh.sh plugin --profile wbptc add dsh-ptc-plus                           # 装执行内核（首次）
bash scripts/describe-tools.sh                                                        # 部署 profile/runner + 生成工具声明
bash scripts/check.sh                                                                 # 回归检查（含模型行禁用断言）
node scripts/install-mcp.mjs                                                          # 写 WorkBuddy 的 MCP 配置（自动备份）
```

### 架构

```
你 → WorkBuddy 模型 ──批量──→ run_program（MCP）→ dsh PTC 运行时 → 结果
                    └──单发──→ 直接执行（不经过本项目）
```

零 agent 架构：不挂 dsh 的模型、不建 agent 循环——这是「不花钱」三层保险的地基（ADR-0001）。

### 已知限制

- **单发操作不走程序**：程序启动本身约 0.7 秒，为单个动作用它不划算——两种调用约定并存是设计，不是缺陷（ADR-0002）。
- **沙箱是全开的**：Windows + dsh 0.2.0-rc.2 上任何 OS 级 confinement 都会打死 PTC 子进程（ADR-0004）。不要把它改回 `workspace-write`。
- **执行内核是第三方组件**：dsh-ptc-plus（MIT）——它把 `run_code` 升级为会话级 REPL，解锁了程序内的系统命令能力（ADR-0006）。升级它时对照 `profile/cordis.patch.yml` 里的适配点注释。

### 文档

| 文档 | 内容 |
| --- | --- |
| [`docs/running.md`](docs/running.md) | 构建、运行、验证、MCP 激活流程、环境变量 |
| [`docs/adr/`](docs/adr/) | 6 份决策记录：为什么这么设计 |
| [`skill/SKILL.md`](skill/SKILL.md) | 给模型的 PTC 使用说明（由 setup 装到 `~/.workbuddy/skills/wbptc/`） |
| [`mcp/tools-sdk.md`](mcp/tools-sdk.md) | 程序里可用的工具签名（生成物，不要手改） |
| [`GLOSSARY.md`](GLOSSARY.md) | 术语文档 |
