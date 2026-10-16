// 一个真实的多步批量任务，一次程序做完。
//
// 这正是 PTC 的收益所在：glob → 并行读取多个文件 → 汇总，全部在一次执行里
// 完成。中间结果不回模型上下文，模型只看到最后的 return。
//
// 换成"逐个工具调用"的写法，这里至少是 1 + N 次模型往返，且每次的中间结果
// 都会留在上下文里。
//
// 注意 Promise.all：dsh-ops 的验收文档写明"只读工具可并发"——PTC 只会重叠被
// 工具自己声明为并发安全的调用，写入类调用仍然独占串行。
const ROOT = process.cwd() // = 会话 cwd（从仓库根运行时即仓库根），无需硬编码盘符

const listing = await tools.ops_glob({
  path: ROOT,
  pattern: ['**/*.md'],
  sort: 'path',
  limit: 200,
})

const sample = listing.items.slice(0, 5)

const heads = await Promise.all(
  sample.map(path => tools.ops_inspect_local_file({ path, limit: 2 })),
)

const adrMentions = await tools.ops_grep({
  pattern: 'ADR-\\d+',
  path: ROOT,
  glob: ['**/*.md'],
  outputMode: 'count',
})

return {
  markdownFiles: listing.total,
  truncated: listing.truncated,
  firstLines: heads.map((head, index) => ({
    file: sample[index].split(/[\\/]/).pop(),
    status: head.status,
  })),
  adrMentions,
}
