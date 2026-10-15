#!/usr/bin/env bash
#
# 把项目里的 profile 源文件与入口插件部署进隔离的 DSH_HOME。
#
# 不涉及 pnpm：DSH 的载荷允许 patch 行用相对名，按"相对 patch 文件"解析，
# 所以把 runner/ 拷到 profile 目录旁边就够了（见 profile/cordis.patch.yml 注释）。
#
# 用法： scripts/deploy.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="$REPO_ROOT/.dsh-home/profiles/wbptc"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "[wbptc] profile 目录不存在：$PROFILE_DIR" >&2
  echo "[wbptc] 先建它：scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config" >&2
  exit 1
fi

cp "$REPO_ROOT/profile/cordis.patch.yml" "$PROFILE_DIR/cordis.patch.yml"
mkdir -p "$PROFILE_DIR/runner"
cp "$REPO_ROOT/runner/index.js" "$REPO_ROOT/runner/package.json" "$PROFILE_DIR/runner/"

echo "[wbptc] 已部署到 $PROFILE_DIR" >&2
echo "[wbptc]   cordis.patch.yml" >&2
echo "[wbptc]   runner/index.js, runner/package.json" >&2
