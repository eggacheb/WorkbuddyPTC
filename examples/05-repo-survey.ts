// 仓库盘点：一次执行把整个仓库的构成读出来。
//
// 这是"批量读"的典型场景，也是 ADR-0002 里该走程序化调用的那一类：
// glob → 过滤 → 并行读取 → 汇总，全部在一次执行里完成。
// 换成逐个工具调用，这里是 1 + N 次模型往返。
const ROOT = process.cwd() // = 会话 cwd（从仓库根运行时即仓库根），无需硬编码盘符

const tracked = await tools.ops_glob({
  path: ROOT,
  pattern: ['**/*.md', '**/*.js', '**/*.ts', '**/*.yml', '**/*.json'],
  limit: 500,
})

const IGNORE = ['.dsh-home', 'node_modules', '.git', 'package-lock']
const files = tracked.items.filter(p => !IGNORE.some(seg => p.includes(seg)))

// 按目录归类
const byDirectory = {}
for (const path of files) {
  const rel = path.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '')
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '(root)'
  byDirectory[dir] = (byDirectory[dir] ?? 0) + 1
}

// 并行读取每个文件的首行，用来确认它们真的是可读的文本
const firstLines = await Promise.all(
  files.map(async path => {
    const r = await tools.ops_inspect_local_file({ path, limit: 1 })
    return { file: path.replace(`${ROOT}\\`, ''), status: r.status, first: r.items?.[0]?.text ?? null }
  }),
)

return {
  totalTrackedFiles: files.length,
  globTruncated: tracked.truncated,
  byDirectory: Object.fromEntries(Object.entries(byDirectory).sort()),
  allReadable: firstLines.every(f => f.status === 'completed'),
  sample: firstLines.slice(0, 3),
}
