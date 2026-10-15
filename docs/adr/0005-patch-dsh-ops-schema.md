# 给 dsh-ops 的工具 schema 打本地补丁，换取完整的参数类型

DSH 的 PTC 代码生成器有一个**固定的 schema 关键字子集**：`type` / `oneOf` / `properties` / `required` / `additionalProperties` / `items` / `enum` / `const`，外加注解 `description` / `title` / `default` / `examples`。超出子集的关键字会让 `assertSupportedJsonSchema()` 抛错、被 catch 之后把**整个参数类型降级成 `unknown`**——这是刻意"宁可不给类型，也不给错类型"，不是 bug。

dsh-ops 用原始 JSON Schema 手写工具定义，带了三个子集外的数值边界关键字：`minimum` / `maximum` / `minItems`。于是它那四个文件工具的参数在 SDK 声明里全是 `unknown`——**WorkBuddy 的模型因此看不到 `pattern` 是 `string[]`、`outputMode` 有哪几个取值**，写不出正确的程序。

因此本项目的部署流程里加一步：把这三个关键字从 dsh-ops 的 `lib/file/contract.js` 里去掉。约束本身仍然由 Rust worker 在运行时强制，schema 里少的是声明，不是校验。实测补丁后声明从 7752 涨到 8459 字节，`unknown` 归零，`ops_glob` 拿到 `pattern: string[]`、`outputMode?: "paths" | "details"` 这样的完整类型。

## Considered Options

- **不改，用技能文档手工维护一张参数表** —— 零风险，且能写进比 schema 更丰富的信息（比如"与 `root`/`cwd`/`file_path` 别名互斥"）。否决为**主要手段**：那是第二份真相来源，会随上游漂移；现有方案下技能只需指个路。文档里仍保留行为性说明。
- **等上游修** —— 正确但不可控。dsh-ops 的 schema 写法本身没错，是两边的子集没对上；值得提 issue，但不能拿它当排期。
- **在我们自己的 profile 里注册一层包装工具，声明合规 schema、转发给 dsh-ops** —— 不动第三方包，最干净。否决：四个工具要重写一遍参数表并保持同步，还多一层调用，成本高于收益。

## Consequences

- **改的是第三方包。** dsh-ops 升级会覆盖补丁，参数类型会**静默**退回 `unknown`。所以 `scripts/describe-tools.sh` 里有一道断言：生成后若仍见 `: unknown;` 就报错退出——宁可生成失败，也不要静默退化。
- 补丁脚本自己检测重复应用（文件头有标记行），可安全重跑。
- 上游的正确修法是给 dsh-ops 提 issue/PR 去掉这三个关键字；一旦它自己改好，本补丁与断言都应删除。
- 补丁只动 `contract.js` 一个文件，`shell` / `background` / `ptc` 三个组件不受影响。
