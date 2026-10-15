# WorkbuddyPTC

**让 WorkBuddy 处理"一大批文件"时更快、更聪明。**

## 这是什么（人话版）

平时让 WorkBuddy 干"翻十几个文件、找东西、汇总成表"的活，它得一个一个来：每翻一个，对话里就多记一笔。文件一多，对话变得又长又慢，它的反应质量也会下降。

这个项目给它换了一种干法：**把整批操作写成一个一次性小程序，交给一个专门的执行器，一口气跑完。** 只有最后的汇总结果回到对话——中间翻了哪些文件、怎么试错的，全部不占地方。

一个真实对比：

> 你说：**"把 docs 下所有文章的标题和行数列成一张表。"**
>
> 普通做法：打开第一个文件 → 记录 → 打开第二个 → 记录…… 来回十几轮
> 用了它：一次跑完，直接把表给你

背后的执行部件来自 DeepSeek Harness（一个开源项目），但对使用者完全透明——你不需要了解它。

## 开始前，你需要有

| 需要什么 | 怎么获得 |
| --- | --- |
| 一台 Windows 电脑（64 位） | 本项目目前只支持 Windows |
| **DeepSeek Harness 桌面应用** | 从 <https://github.com/deepseek-ai/deepseek-harness> 获取并安装。本项目只使用它的执行部件，**不会动它的任何设置**，安装后也不需要让它保持运行 |
| **Node.js** | <https://nodejs.org> 下载 LTS 版，安装时全部默认选项 |
| **Git**（自带 Git Bash） | <https://git-scm.com> 下载安装，用来运行部署命令 |
| WorkBuddy | 你已经有了 |

## 部署（三步）

### 第 1 步：把项目放到电脑上

把整个项目文件夹放到任意位置，比如 `D:\code\WorkbuddyPTC`（路径建议用纯英文）。

### 第 2 步：一键部署

打开 **Git Bash**（开始菜单搜索 "Git Bash"），粘贴运行：

```sh
cd /d/code/WorkbuddyPTC      # ← 换成你实际放项目的位置
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

（更真实的验证："把 docs 下所有 markdown 的标题列成一张表"）

## 出问题怎么办

| 现象 | 怎么办 |
| --- | --- |
| setup.sh 提示找不到 dsh | DeepSeek Harness 没装好，或装了非默认位置。装好后重试；也可以手动指定：`DSH_BIN=你的路径 bash scripts/setup.sh` |
| 重启后列表里还是没有 wbptc | 确认是"完全退出"WorkBuddy（任务栏/托盘图标也要退），再试一次 |
| 其他报错 | 在项目文件夹里运行 `bash scripts/check.sh`，把完整输出保存下来求助 |

## 日常怎么用

装好之后，什么都不用记。照常提要求即可：

> 找出所有超过 100 行的文件，按大小排个序
> 把 docs 里所有文章里过期的内容列出来

需要批量处理的活，WorkBuddy 会自动走这条快路；简单的读一个文件、改一行，照常直接做。**你不需要指定任何工具。**

**常见问题：DeepSeek Harness 桌面应用要一直开着吗？** 不用。WorkBuddy 干活时会自己临时启动一个后台实例，干完就退——实测在桌面应用完全关闭时照常工作。你想开就开、想关就关，互不影响。

## 安全吗

三条保证，都是实测验证过的：

- **不多花一分钱** —— 执行的程序不调用任何 AI 模型，也不使用你 DeepSeek Harness 账号里的余额（执行环境里连凭据都没有）
- **不碰你的 DeepSeek Harness** —— 完全独立运行，不读也不写它自己的配置
- **权限和 WorkBuddy 本身一致** —— WorkBuddy 能做的它才能做；不后台常驻，跑完即退

---

## 给维护者

### 部署命令（分步版）

`bash scripts/setup.sh` 是幂等的，可重复运行。它展开就是：

```sh
bash scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config  # 建 profile（首次）
bash scripts/dsh.sh plugin --profile wbptc add dsh-ops                                # 装 dsh-ops 插件（首次）
bash scripts/describe-tools.sh                                                        # 部署 profile/runner + 生成工具声明
bash scripts/check.sh                                                                 # 回归检查
node scripts/install-mcp.mjs                                                          # 写 WorkBuddy 的 MCP 配置（自动备份）
```

### 架构

```
你 → WorkBuddy 模型 ──批量──→ run_program（MCP）→ dsh PTC 运行时 → 结果
                    └──单发──→ 直接执行（不经过本项目）
```

零 agent 架构：不挂 dsh 的模型、不建会话、不跑 agent 循环——这是「不花钱」三层保险的地基（ADR-0001）。

### 已知限制

- **单发操作不走程序**：一次执行要启动一遍运行时（dsh-ptc-plus 内核，实测约 9 秒），两种调用约定并存是设计，不是缺陷（ADR-0002）。
- **沙箱是全开的**：Windows + dsh 0.2.0-rc.2 上任何 OS 级 confinement 都会打死 PTC 子进程（ADR-0004）。不要把它改回 `workspace-write`。
- **执行内核是第三方组件**：dsh-ptc-plus（MIT）——它解锁了程序内的系统命令能力（ADR-0006）。升级它时对照 `profile/cordis.patch.yml` 里的适配点注释。

### 文档

| 文档 | 内容 |
| --- | --- |
| [`docs/running.md`](docs/running.md) | 构建、运行、验证、MCP 激活流程、环境变量 |
| [`docs/adr/`](docs/adr/) | 5 份决策记录：为什么这么设计 |
| [`skill/SKILL.md`](skill/SKILL.md) | 给模型的 PTC 使用说明（由 setup 装到 `~/.workbuddy/skills/wbptc/`） |
| [`mcp/tools-sdk.md`](mcp/tools-sdk.md) | 程序里可用的工具签名（生成物，不要手改） |
| [`GLOSSARY.md`](GLOSSARY.md) | 术语文档 |
