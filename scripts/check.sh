#!/usr/bin/env bash
#
# 统一回归检查。把散落的手动验证收拢成一个入口。
#
# 为什么存在：本项目最危险的回归是「模型侧被意外重新启用」——它会直接花真钱，
# 而此前它只能靠人记得手动 grep。其余每一项也都对应一次真实的事故或险情：
# 部署副本落后、schema 补丁被升级覆盖、语法笔误。见 docs/adr/ 与 git log。
#
# 用法：
#   scripts/check.sh           全部检查（静态 + 需要 dsh 的部分，约 5 秒）
#   scripts/check.sh --static  只跑静态部分（pre-commit 钩子用，毫秒级）
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="${1:-full}"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n' "$1"; }
skip() { printf '  [skip] %s\n' "$1"; }

# 在 CONFIG（dump-config 输出）里断言：id 对应条目的 disabled 为 true
assert_row_disabled() {
  local id="$1"
  if printf '%s\n' "$CONFIG" | awk -v id="$id" '
    $0 == "- id: " id { found = 1; next }
    found && /^- id:/ { found = 0 }
    found && /disabled: true/ { hit = 1 }
    END { exit hit ? 0 : 1 }
  '; then
    ok "模型行已禁用：$id"
  else
    bad "模型行未禁用：$id —— 这条一旦放开就会花钱，见 docs/adr/0001"
  fi
}

echo "wbptc 回归检查（模式：$MODE）"
echo

# ---------- 静态：部署副本与源一致（改了 profile/runner 忘了 deploy） ----------
echo "部署同步"
sync_check() {
  local src="$1" dst="$2" label="$3"
  if [ ! -f "$dst" ]; then
    skip "$label：部署副本还不存在（先按 docs/running.md 建 profile 并 deploy）"
    return
  fi
  if diff -q "$src" "$dst" >/dev/null 2>&1; then
    ok "$label 已部署"
  else
    bad "$label：源已改但没部署 —— 跑 scripts/deploy.sh"
  fi
}
sync_check profile/cordis.patch.yml .dsh-home/profiles/wbptc/cordis.patch.yml "profile/cordis.patch.yml"
sync_check runner/index.js .dsh-home/profiles/wbptc/runner/index.js "runner/index.js"
sync_check runner/package.json .dsh-home/profiles/wbptc/runner/package.json "runner/package.json"
echo

# ---------- 静态：插件存在（setup.sh 漏装 / 包被删） ----------
# 两个插件都是能力所在：dsh-ops 提供 ops_* 文件工具；dsh-ptc-plus 是执行内核
# （替换原版 ptc-runtime，解锁程序内系统命令能力，ADR-0006）。
echo "插件"
if [ ! -d .dsh-home/profiles/wbptc ]; then
  skip "profile 还不存在（先跑 scripts/setup.sh）"
else
  for p in dsh-ops dsh-ptc-plus; do
    if [ -d ".dsh-home/profiles/wbptc/node_modules/$p" ]; then
      ok "插件已安装：$p"
    else
      bad "插件缺失：$p —— 跑 scripts/setup.sh（会装缺失的插件）"
    fi
  done

  # 描述层适配：dsh-ptc-plus < 0.5.1 在 dsh 0.2.1 下会把 run_code 的描述退化成
  # "erasable syntax only — no enum or namespaces"。实测能力没坏（0.5.0 下 enum 照样
  # 能跑），但模型看到描述会自我限制，不敢用 enum。0.5.1 才把描述修回来。
  if [ -f ".dsh-home/profiles/wbptc/node_modules/dsh-ptc-plus/package.json" ]; then
    PTC_PLUS_VER="$(node -p "require('./.dsh-home/profiles/wbptc/node_modules/dsh-ptc-plus/package.json').version" 2>/dev/null || echo 0.0.0)"
    if node -e "const [a,b,c]=process.argv[1].split('.').map(Number);process.exit(a>0||(a===0&&(b>5||(b===5&&c>=1)))?0:1)" "$PTC_PLUS_VER"; then
      ok "dsh-ptc-plus 版本 $PTC_PLUS_VER（>= 0.5.1，描述层已适配 dsh 0.2.1）"
    else
      bad "dsh-ptc-plus 版本 $PTC_PLUS_VER < 0.5.1 —— run_code 描述会退化，跑 scripts/setup.sh 更新"
    fi
  fi
fi
echo

# ---------- 静态：语法 ----------
echo "语法"
if command -v node >/dev/null 2>&1; then
  for f in runner/index.js mcp/server.js scripts/lib-find-dsh.mjs scripts/install-mcp.mjs; do
    if node --check "$f" >/dev/null 2>&1; then ok "node --check $f"; else bad "node --check $f"; fi
  done
  for f in mcp/package.json; do
    if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" >/dev/null 2>&1; then
      ok "JSON 合法：$f"
    else
      bad "JSON 非法：$f"
    fi
  done
else
  skip "找不到 node，跳过 JS/JSON 检查"
fi
for f in scripts/*.sh; do
  if bash -n "$f" 2>/dev/null; then ok "bash -n $f"; else bad "bash -n $f"; fi
done
if command -v python >/dev/null 2>&1; then
  if python -c "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())" scripts/patch-dsh-ops-schema.py >/dev/null 2>&1; then
    ok "py 语法：patch-dsh-ops-schema.py"
  else
    bad "py 语法：patch-dsh-ops-schema.py"
  fi
else
  skip "找不到 python，跳过 py 语法检查"
fi
echo

# ---------- 需要 dsh 的部分 ----------
if [ "$MODE" != "--static" ]; then
  echo "dsh 组合（启动一次，约几秒）"
  if [ ! -d .dsh-home/profiles/wbptc ]; then
    skip "隔离的 profile 不存在 —— 先按 docs/running.md 建它"
  else
    CONFIG="$(bash scripts/dsh.sh --profile wbptc --dump-config 2>/dev/null || true)"
    if [ -z "$CONFIG" ]; then
      bad "dump-config 没有输出"
    else
      for id in llm-deepseek deepseek-llm-api-extensions llm-retry session-title; do
        assert_row_disabled "$id"
      done
      if printf '%s\n' "$CONFIG" | awk '
        $0 == "- id: tools" { found = 1; next }
        found && /^- id:/ { found = 0 }
        found && /mode: ptc/ { hit = 1 }
        END { exit hit ? 0 : 1 }
      '; then
        ok "tools 处于 ptc 模式"
      else
        bad "tools 不在 ptc 模式 —— wire 会暴露全部工具，技能的所有假设都会破裂"
      fi
    fi
  fi
  echo

  echo "工具声明（重生成 + schema 补丁 + unknown 断言）"
  if bash scripts/describe-tools.sh >/tmp/wbptc-check-describe.log 2>&1; then
    ok "describe-tools.sh：生成成功且无 unknown"
    if ! git diff --quiet -- mcp/tools-sdk.md 2>/dev/null; then
      printf '  [note] mcp/tools-sdk.md 与上次提交不同 —— 确认后提交\n'
    fi
  else
    bad "describe-tools.sh 失败（多半是 schema 补丁被 dsh-ops 升级覆盖）"
    tail -6 /tmp/wbptc-check-describe.log | sed 's/^/         /'
  fi
  echo
fi

# ---------- 台账：只展示，不断言 ----------
# 这**不是**断言：你平时自己用 dsh 桌面应用时消费是正常的。
# 唯一能断言的是「模型行被禁用」——它让消费在代码路径上不可能。
echo "台账（仅供参考，不做断言）"
LEDGER="/c/Users/Administrator/.dsh/.dshw-usage.json"
if [ -f "$LEDGER" ]; then
  grep -o '"debitUnits":[0-9]*\|"lastBalance":[0-9.]*' "$LEDGER" | head -2 | sed 's/^/  /'
else
  skip "找不到台账：$LEDGER"
fi
echo

echo "================"
echo "通过 $PASS 项，失败 $FAIL 项"
[ "$FAIL" -eq 0 ] || exit 1
