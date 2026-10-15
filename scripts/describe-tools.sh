#!/usr/bin/env bash
#
# 生成 WorkBuddy 侧需要的工具声明。
#
# 内容不是我们手写的——它是 DSH 在 PTC 模式下本来就要放进系统提示的
# `tools:sdk` 段，由注册表的 jsonSchemaToTs() 从工具 JSON Schema 生成。
# 我们只是把它取出来落盘，让 WorkBuddy 的模型按需读。
#
# 生成前会先把 dsh-ops 的 schema 收敛到 DSH 支持的子集内，否则 ops_* 的
# 参数类型会整体降级成 unknown（原因见 scripts/patch-dsh-ops-schema.py）。
#
# 用法： scripts/describe-tools.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/mcp/tools-sdk.md"
CONTRACT="$REPO_ROOT/.dsh-home/profiles/wbptc/node_modules/dsh-ops/lib/file/contract.js"

bash "$REPO_ROOT/scripts/deploy.sh" >&2

# dsh-ops 的 schema 补丁。它改的是第三方包，dsh-ops 升级会覆盖，
# 所以下面有一道断言兜底——宁可生成失败，也不要静默退化成 unknown。
if [ -f "$CONTRACT" ]; then
  python "$REPO_ROOT/scripts/patch-dsh-ops-schema.py" "$CONTRACT" >&2
else
  echo "[wbptc] 找不到 dsh-ops 的 contract.js：$CONTRACT" >&2
  echo "[wbptc] 先装它：bash scripts/dsh.sh plugin --profile wbptc add dsh-ops" >&2
  exit 1
fi

WBPTC_WORKSPACE="$REPO_ROOT" bash "$REPO_ROOT/scripts/dsh.sh" \
  --profile wbptc --describe-tools > "$OUT" 2>/dev/null

if [ ! -s "$OUT" ]; then
  echo "[wbptc] 生成失败：$OUT 是空的" >&2
  exit 1
fi

# 断言：dsh-ops 的四个文件工具不该降级为 unknown —— 这才是 schema 补丁要防的。
# 注意不能宽泛地 grep ': unknown;'：dsh-ptc-plus 的声明里合法存在 unknown
# （capabilities 的 owner/contract 等类型），那是它的设计而非降级。
if grep -qE '^  ops_[a-z_]+: unknown;$' "$OUT"; then
  echo "[wbptc] ops_* 的参数类型降级为 unknown：" >&2
  grep -nE '^  ops_[a-z_]+: unknown;$' "$OUT" >&2
  echo "[wbptc] 多半是 dsh-ops 升级覆盖了 schema 补丁。检查 scripts/patch-dsh-ops-schema.py。" >&2
  exit 1
fi

echo "[wbptc] 已生成 $OUT（$(wc -c < "$OUT") 字节，$(grep -c '^' "$OUT") 行，ops_* 无降级）" >&2
