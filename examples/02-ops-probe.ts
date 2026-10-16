// 探测 dsh-ops 的文件工具在 PTC 程序里能不能用、返回什么形状。
// 用的是 ops_glob（Rust 实现的多模式找路径）。
//
// 基准路径用 process.cwd() —— 它就是会话 cwd（从仓库根运行脚本时即仓库根），
// 所以这份示例 clone 到哪个盘、哪个目录都能直接跑。
const result = await tools.ops_glob({
  path: process.cwd(),
  pattern: ['**/*.md'],
  limit: 50,
})
return result
