#!/usr/bin/env python3
"""把 dsh-ops 的工具 schema 收敛到 DSH 支持的子集内。

## 为什么需要这个

DSH 的 PTC 代码生成器 `jsonSchemaToTs()` 有一个**固定的 schema 关键字子集**：

    type / oneOf / properties / required / additionalProperties / items / enum / const
    + 注解 description / title / default / examples

超出这个子集的关键字会让 `assertSupportedJsonSchema()` 抛错，被 catch 之后整个
参数类型降级成 `unknown`（packages/core/tools/src/ts-types.ts 的 jsonSchemaToTs）。
它是刻意"宁可不给类型，也不给错类型"，不是 bug。

dsh-ops 用原始 JSON Schema 手写工具定义，带了三个子集外的**数值边界**关键字：
`minimum` / `maximum` / `minItems`。它们的约束在运行时由 Rust worker 强制，
写进 schema 只是声明；去掉之后参数类型就能正常生成。

## 代价（必须知道）

改的是**第三方包**。dsh-ops 升级后这个改动会被覆盖，参数类型会**静默**退回
`unknown`。所以配套有一道断言：scripts/describe-tools.sh 生成后会检查是否
还有 `unknown` 参数，有就报错。

上游的正确修法是给 dsh-ops 提 issue/PR 去掉这三个关键字。

用法： scripts/patch-dsh-ops-schema.py <contract.js 路径>
"""
import re
import sys
from pathlib import Path

# 只针对这几个顶层约束关键字；不动 type/properties/items/enum/required/additionalProperties
UNSUPPORTED = ("minimum", "maximum", "minItems")

PATTERNS = [
    # { type: 'integer', minimum: 0 }  ->  { type: 'integer' }
    (re.compile(r",\s*" + kw + r"\s*:\s*-?\d+"), "")
    for kw in UNSUPPORTED
]
# { ...integer, minimum: 1, maximum: 10000 } 简化成 integer 本身
SPREAD_SIMPLIFY = re.compile(
    r"\{\s*\.\.\.(\w+)(?:\s*,\s*(?:" + "|".join(UNSUPPORTED) + r")\s*:\s*-?\d+)+\s*\}"
)

MARKER = "// [wbptc] patched: unsupported schema keywords stripped"


def main() -> int:
    if len(sys.argv) != 2:
        print("用法: patch-dsh-ops-schema.py <contract.js>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"找不到文件：{path}", file=sys.stderr)
        return 2

    source = path.read_text(encoding="utf-8")
    if MARKER in source:
        print(f"已经是打过补丁的状态：{path}")
        return 0

    patched = SPREAD_SIMPLIFY.sub(r"\1", source)
    for pattern, replacement in PATTERNS:
        patched = pattern.sub(replacement, patched)

    remaining = [kw for kw in UNSUPPORTED if re.search(r"\b" + kw + r"\s*:", patched)]
    if remaining:
        print(f"补丁不完整，仍残留：{remaining}", file=sys.stderr)
        return 1

    path.write_text(f"{MARKER}\n{patched}", encoding="utf-8")
    print(f"已打补丁：{path}（缩减 {len(source) - len(patched)} 字节）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
