/**
 * 定位 DeepSeek Harness 的 dsh.cmd —— bash 侧 scripts/lib-find-dsh.sh 的 Node 孪生。
 *
 * 两处需要它，原因是「找不到 dsh」的失败形态最难查：
 *   - mcp/server.js —— 运行时。每次 run_program 都要 spawn 它；找不到时如果只留一句
 *     英文的系统错误，用户根本不知道是自己没装还是配置写错了。
 *   - scripts/install-mcp.mjs —— 安装时。把找到的路径写成显式配置，最稳。
 *
 * 顺序：DSH_BIN 环境变量（显式覆盖优先，不做存在性检查——用户指定了就以他的为准）
 *      → 常见安装位置。
 *
 * ⚠️ 候选表与 scripts/lib-find-dsh.sh 是**两份**（bash 无法 import 本模块），
 * 改一处要同步改另一处。
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * @returns {string|null} dsh 可执行文件的路径；候选位置都没有时返回 null。
 */
export function findDsh() {
  const explicit = process.env.DSH_BIN
  if (typeof explicit === 'string' && explicit !== '') return explicit

  const candidates = [
    path.join(homedir(), 'AppData', 'Local', 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'),
    'C:\\Program Files\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd',
  ]
  return candidates.find(candidate => existsSync(candidate)) ?? null
}
