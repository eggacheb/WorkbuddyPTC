// 写操作验证：先用 dryRun 看影响面，再真正落盘。
//
// 这是"放开用"之后的第一个写操作测试。ops_replace 走的是 dsh-ops 的 Rust 安全
// 批处理，写入使用内容 revision 校验与原子替换。
//
// 目标文件在 .dsh-home/scratch/ 下（gitignore 内），不污染仓库。
const TARGET = 'D:/code/WorkbuddyPTC/.dsh-home/scratch/write-test.txt'

// 1) 先预演：只观察，不落盘
const preview = await tools.ops_replace({
  path: TARGET,
  pattern: 'BEFORE',
  replacement: 'AFTER',
  dryRun: true,
})

// 2) 再真正执行
const applied = await tools.ops_replace({
  path: TARGET,
  pattern: 'BEFORE',
  replacement: 'AFTER',
})

return {
  preview: { status: preview.status, changed: preview.changed, matched: preview.matched },
  applied: { status: applied.status, changed: applied.changed, matched: applied.matched },
  sandbox: applied.sandbox,
}
