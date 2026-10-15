// 探测 dsh-ops 的文件工具在 PTC 程序里能不能用、返回什么形状。
// 用的是 ops_glob（Rust 实现的多模式找路径）。
const result = await tools.ops_glob({
  path: 'D:/code/WorkbuddyPTC',
  pattern: ['**/*.md'],
  limit: 50,
})
return result
