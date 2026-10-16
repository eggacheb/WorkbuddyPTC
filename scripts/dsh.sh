#!/usr/bin/env bash
#
# 本项目里唯一允许调用 dsh 的入口。
#
# 它强制三件事，缺一不可（见 docs/adr/0003-isolated-dsh-home.md）：
#   1. DSH_HOME 必须是项目目录内的 .dsh-home，绝不允许落到用户的 ~/.dsh
#   2. 抹掉所有可能被 dsh 读到的模型 API 凭据环境变量
#   3. 拒绝直接调用 dsh 二进制以外的意外路径
#
# 用法：scripts/dsh.sh --profile wbptc --dump-config
#       scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- 守卫 1：外部传入的 DSH_HOME 必须在项目目录内 ---
if [ -n "${DSH_HOME:-}" ]; then
  case "$DSH_HOME" in
    "$REPO_ROOT"/*) ;;
    *)
      echo "[wbptc] 拒绝：外部传入的 DSH_HOME 不在项目目录内：$DSH_HOME" >&2
      echo "[wbptc] 这会污染用户的 ~/.dsh。本项目绝不允许。" >&2
      exit 1
      ;;
  esac
fi
export DSH_HOME="$REPO_ROOT/.dsh-home"
mkdir -p "$DSH_HOME"

# --- 守卫 2：抹掉模型凭据 ---
# dsh-llm-deepseek-api-key 的 apiKeyEnv 是 DEEPSEEK_API_KEY；即使那一行被误开启，
# 也不该有凭证可用。
unset DEEPSEEK_API_KEY
unset DEEPSEEK_API_BASE
unset DEEPSEEK_BASE_URL

# --- 守卫 3：定位 dsh 二进制（候选路径见 scripts/lib-find-dsh.sh） ---
. "$REPO_ROOT/scripts/lib-find-dsh.sh"
if ! DSH_BIN="$(find_dsh)"; then
  echo "[wbptc] 找不到 dsh。请先安装 DeepSeek Harness 桌面应用，" >&2
  echo "[wbptc] 或用 DSH_BIN=/你的路径/dsh.cmd 显式指定。" >&2
  exit 1
fi
export DSH_BIN

# --- 会话 cwd：默认取"你运行命令时所在的目录" ---
# 它同时是程序里 process.cwd() 与 dsh-ops 相对路径的基准。手动跑示例时，
# 从仓库根运行就等于仓库根——比"程序文件所在目录"（runner 的兜底）更符合直觉，
# 也不会因为示例放在 examples/ 下就把基准带偏。
#
# 格式要求：Node 的路径解析不认 MSYS 风格（/d/...），会拼成 C:\d\...。
# 所以调方给的值先规范化一遍，再补默认值。
case "${WBPTC_WORKSPACE:-}" in
  /[a-zA-Z]/*)
    WBPTC_WORKSPACE="$(cd "$WBPTC_WORKSPACE" 2>/dev/null && pwd -W)" || WBPTC_WORKSPACE=""
    ;;
esac
# pwd -W 是 git bash 的扩展（输出 D:/...）；非 MSYS 环境（Linux/WSL）没有它，回退到 pwd。
export WBPTC_WORKSPACE="${WBPTC_WORKSPACE:-$(pwd -W 2>/dev/null || pwd)}"

echo "[wbptc] DSH_HOME=$DSH_HOME" >&2
echo "[wbptc] 会话 cwd=$WBPTC_WORKSPACE" >&2
echo "[wbptc] 模型凭据：已抹除（DEEPSEEK_API_KEY 未设置）" >&2
exec "$DSH_BIN" "$@"
