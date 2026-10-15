# 用户共享的 `~/.dsh` 一律不碰，本项目自建 DSH_HOME

用户的 `C:\Users\Administrator\.dsh` 是 DeepSeek Harness 桌面应用（`DeepSeek Harness.exe`）的 home，里面有他正在使用的 `desktop` 与 `web` 两个 profile、会话历史，以及官方 API 的账号配置。本项目**必须与它完全隔离**：所有 dsh 调用一律通过 `scripts/dsh.sh`，它把 `DSH_HOME` 钉死在项目内的 `.dsh-home/`，并在外部传入别的 `DSH_HOME` 时直接拒绝。代价是本项目的运行时状态（profile、会话、缓存）各存一份，不复用桌面应用的任何东西；换来的是本项目无论怎么折腾都不会影响桌面应用。

## Considered Options

- **复用用户现有的 `~/.dsh`** —— 省一份运行时状态，还能直接复用桌面应用已装的插件（`dsh-ops` 等）。否决：profile、会话、缓存、home 级 patch 全部共享，任何一次实验都可能改到用户正在用的东西。
- **只隔离 profile 目录，不换 `DSH_HOME`** —— 看起来够用。否决：`$DSH_HOME/cordis.patch.yml` 是 home 级、**优先级高于每个 profile 自己的 patch**；会话与缓存也落在共享目录里。"只管一个子目录"靠的是自觉，不是结构。

## Consequences

- 本项目里**不允许**直接调用 `dsh` 二进制，一律走 `scripts/dsh.sh`。这是唯一入口，不是建议。
- `.dsh-home/` 进 `.gitignore`：它是运行时状态，不是源码。
- 桌面应用升级对本项目无影响，反之亦然。代价：本项目的 profile 不会自动获得桌面应用新装的插件，需要就在自己的 profile 里单独装。
- **首次建立时的一次污染已清理**：2026-10-15 的探查中，一个 profile 曾被误建在用户的 `~/.dsh/profiles/wbptc`。已完整移出到 `D:\code\_refs\_removed-from-user-dsh-home\`（未删除），用户的 `profiles/` 恢复为 `desktop / node_modules / web` 三个条目，`desktop` 的配置与依赖时间戳未变。此后改用隔离的 `DSH_HOME` 重建，已复核用户在 `.dsh` 上的目录时间戳前后一致。
