# 定位 DeepSeek Harness 的 dsh.cmd。被 dsh.sh 与 setup.sh 共用，保持单一真相。
#
# 顺序：DSH_BIN 环境变量（显式覆盖优先）→ 常见安装位置。
# 全部用 MSYS 风格路径（/c/...），git bash 下最稳。
#
# 用法：
#   . scripts/lib-find-dsh.sh
#   DSH_BIN="$(find_dsh)" || echo "找不到"
find_dsh() {
  local candidate
  for candidate in \
    "${DSH_BIN:-}" \
    "$HOME/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd" \
    "/c/Program Files/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd" \
    ; do
    if [ -n "$candidate" ] && [ -e "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}
