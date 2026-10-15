#!/usr/bin/env bash
#
# 一键部署。给第一次使用的机器用；可重复运行，已完成的步骤自动跳过。
#
# 它会做六件事：
#   1. 检查前置（node、dsh）
#   2. 建 wbptc profile（首次）
#   3. 装 dsh-ops 插件（首次）
#   4. 部署 profile 与入口插件，并生成工具声明
#   5. 跑回归检查
#   6. 接入 WorkBuddy：写 MCP 配置 + 安装技能
#
# 用法： bash scripts/setup.sh
# 找不到 dsh 时： DSH_BIN=/你的路径/dsh.cmd bash scripts/setup.sh
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PROFILE_DIR="$REPO_ROOT/.dsh-home/profiles/wbptc"

step() { printf '\n== %s\n' "$1"; }
ok()   { printf '   [ok] %s\n' "$1"; }
die()  { printf '\n[中止] %s\n' "$1" >&2; exit 1; }

printf 'wbptc 一键部署\n'
printf '（可以重复运行；已完成的步骤会自动跳过）\n'

# ---- 1/6 前置 ----
step "1/6  检查前置"
command -v node >/dev/null 2>&1 || die "找不到 node。请先安装 Node.js：https://nodejs.org"
ok "node：$(command -v node)"

. "$REPO_ROOT/scripts/lib-find-dsh.sh"
if DSH_BIN="$(find_dsh)"; then
  export DSH_BIN
  ok "dsh：$DSH_BIN"
else
  die "找不到 DeepSeek Harness 的 dsh.cmd。
       请先安装 DeepSeek Harness 桌面应用，或手动指定后重试：
       DSH_BIN=/你的/路径/dsh.cmd bash scripts/setup.sh"
fi

# ---- 2/6 profile ----
step "2/6  创建 wbptc profile"
if [ -d "$PROFILE_DIR" ]; then
  ok "已存在，跳过"
else
  echo "   从 sdk-minimal 模板创建（首次约 10 秒）……"
  if ! bash scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config >/dev/null 2>&1; then
    die "创建失败。单独重跑看报错：
       bash scripts/dsh.sh --profile wbptc --from-default-profile sdk-minimal --dump-config"
  fi
  ok "已创建"
fi

# ---- 3/6 dsh-ops ----
step "3/6  安装 dsh-ops 插件"
if [ -d "$PROFILE_DIR/node_modules/dsh-ops" ]; then
  ok "已安装，跳过"
else
  echo "   从 npm 安装（首次约半分钟）……"
  if ! bash scripts/dsh.sh plugin --profile wbptc add dsh-ops >/dev/null 2>&1; then
    die "安装失败。单独重跑看报错：
       bash scripts/dsh.sh plugin --profile wbptc add dsh-ops"
  fi
  ok "已安装"
fi

# ---- 4/6 部署 + 声明 ----
step "4/6  部署并生成工具声明"
if ! bash scripts/describe-tools.sh >/dev/null 2>&1; then
  die "失败。单独重跑看报错： bash scripts/describe-tools.sh"
fi
ok "profile 与入口插件已部署，工具声明已生成"

# ---- 5/6 回归 ----
step "5/6  回归检查"
if bash scripts/check.sh; then
  ok "全部通过"
else
  die "回归检查未通过。先解决上面的 FAIL 项再继续。"
fi

# ---- 6/6 接入 WorkBuddy ----
step "6/6  接入 WorkBuddy"
if ! node scripts/install-mcp.mjs; then
  die "写 MCP 配置失败"
fi
ok "MCP 配置已写入"

SKILL_DIR="$HOME/.workbuddy/skills/wbptc"
mkdir -p "$SKILL_DIR"
cp "$REPO_ROOT/skill/SKILL.md" "$SKILL_DIR/SKILL.md"
ok "技能已装到 $SKILL_DIR"

cat <<'EOF'

=============================================
 全部就绪。还剩两步（一次性，人工完成）：

   1. 完全退出并重启 WorkBuddy
   2. 连接器 → 右上角「自定义连接器」→ MCP 服务管理
      → 在列表里找到 wbptc → 点「信任」

 验证：在 WorkBuddy 新开一个对话，说：
     "用 run_program 算一下 1 + 1"

 看到返回 2，就全部打通了。
=============================================
EOF
