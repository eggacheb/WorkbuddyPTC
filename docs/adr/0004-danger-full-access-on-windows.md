# 沙箱取 `danger-full-access`：Windows 上任何 confinement 都会打死 PTC 子进程

PTC 的 Node 子进程在这台机器上只有不叠加 OS 级 confinement 时才跑得起来。三种模式实测（DSH 0.2.0-rc.2 + Windows x64）：

| 模式 | 结果 |
| --- | --- |
| `read-only` | `worker-exit`：`Invalid file descriptor to ICU data received`，`enforcement: partial` |
| `workspace-write` | 同上 |
| `danger-full-access` | 正常，`enforcement: policy`，`boundary: trusted-native-file-operations` |

这是上游限制，不是本项目引入的：Windows 上 confinement 本来就只报 `partial`，而受约束的 Node 子进程读不到自己的 ICU 数据就硬崩。**因此本项目取 `danger-full-access`，程序本身没有 OS 级文件兜底**，只靠两层：dsh-ops 工具自己的策略层（该模式下它跳过写入路径检查），以及"程序是我们自己的模型写的"这个信任前提。

**读到这里的后来者：这不是疏漏，不要把它"修"成 `workspace-write`——那会让整条链路直接不可用。** 想验证的话用它做回归：`WBPTC_SANDBOX=workspace-write bash scripts/dsh.sh --profile wbptc examples/03-batch-scan.ts`，预期是 `worker-exit`。

## Considered Options

- **`workspace-write` 或 `read-only`** —— 安全姿态正确，且 sdk-minimal 的模板本来允许。否决：实测跑不起来，链路直接断。
- **先搁置 PTC，等上游修 Windows confinement** —— 最保守。否决：`danger-full-access` 下程序能碰的文件范围，与 WorkBuddy 自己调 Bash 是同一层信任；为一个和现状同级的风险放弃整条链路不成比例。
- **只让 PTC 做只读任务、写操作走别的路** —— 折中。未采纳为**机制**（因为 confinement 崩与读写无关，只读也崩，所以它并不能换来任何真实的约束）；但"写之前先 `dryRun`"作为**习惯**保留。

## Consequences

- `profile/cordis.patch.yml` 的 `sandbox-policy.mode` 默认 `danger-full-access`，`WBPTC_SANDBOX` 可覆盖，用于回归与将来上游修复后的重测。
- `workspaceRoot` 仍由 `WBPTC_WORKSPACE` 决定：`danger-full-access` 下它不再构成约束，但保持设置，以便上游修好后一行切换即可生效。
- 写操作的心智模型：`ops_replace` 先 `dryRun` 看影响面再落盘（它原生支持），这是习惯而不是护栏。
- 上游若修好 Windows confinement，本条应当被取代而不是悄悄修改——README 的 0.3.0 说明里已声明 0.3.0 尚未完成 Linux/macOS 实机 sandbox 测试，Windows 侧同样在演进。
