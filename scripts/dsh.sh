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

# --- 守卫 3：定位 dsh 二进制 ---
DSH_BIN="${DSH_BIN:-/c/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd}"
if [ ! -e "$DSH_BIN" ]; then
  echo "[wbptc] 找不到 dsh：$DSH_BIN" >&2
  echo "[wbptc] 可用 DSH_BIN=... 覆盖。" >&2
  exit 1
fi

echo "[wbptc] DSH_HOME=$DSH_HOME" >&2
echo "[wbptc] 模型凭据：已抹除（DEEPSEEK_API_KEY 未设置）" >&2
exec "$DSH_BIN" "$@"
