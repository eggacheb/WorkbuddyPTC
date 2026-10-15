// 06-program-shell.ts —— 探测：PTC 程序内部的原生进程能力边界（第五轮·终局）
//
// 前四轮：模块可加载但执行失败；环境被清洗；手动 env 也失败；cwd 有效；fs 正常；
// spawnSync 返回 { status: 1, error: null, stdout: '', stderr: '' } —— 形态可疑：
// "看起来运行了但没有输出"。本轮做最终判定：
// 让子进程产生一个「磁盘副作用」（写文件）——文件出现 = 进程真实运行；
// 文件不出现 = 进程根本没有被创建（运行时伪造了退出状态）。

// 判定结果（终局）：三个实验的标记文件全部未出现 —— 子进程从未被创建。
// 结论：原版运行时阻止了进程创建，这是硬边界，不是环境问题。

const clean = (v: unknown): unknown => {
  if (v === undefined) return null
  if (Array.isArray(v)) return v.map(clean)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v)) o[k] = clean((v as Record<string, unknown>)[k])
    return o
  }
  return v
}

const fs = await import('node:fs')
const { spawnSync, execFileSync } = await import('node:child_process')

const marker = String.raw`D:\code\_refs\spawn-marker.txt`
if (fs.existsSync(marker)) fs.unlinkSync(marker)

const minimalEnv = {
  SystemRoot: String.raw`C:\Windows`,
  windir: String.raw`C:\Windows`,
  ComSpec: String.raw`C:\Windows\System32\cmd.exe`,
  PATH: String.raw`C:\Windows\System32;C:\Windows`,
  PATHEXT: '.COM;.EXE;.BAT;.CMD',
}

const out: Record<string, unknown> = {}

// 判定实验 A：spawnSync  + 重定向写文件
const r1 = spawnSync(
  String.raw`C:\Windows\System32\cmd.exe`,
  ['/c', `echo MARKER-A > ${marker}`],
  { encoding: 'utf8', env: minimalEnv, cwd: String.raw`C:\Windows` },
)
out.spawn_a = clean({ status: r1.status, error: r1.error ? String(r1.error) : null })
out.marker_a_exists = fs.existsSync(marker)
if (fs.existsSync(marker)) { out.marker_a_content = fs.readFileSync(marker, 'utf8').trim(); fs.unlinkSync(marker) }

// 判定实验 B：execFileSync + 重定向写文件（命令行方式）
try {
  execFileSync(
    String.raw`C:\Windows\System32\cmd.exe`,
    ['/c', `echo MARKER-B > ${marker}`],
    { encoding: 'utf8', env: minimalEnv, cwd: String.raw`C:\Windows` },
  )
  out.exec_b = 'no-error'
} catch (e) {
  out.exec_b = 'threw: ' + String((e as Error).message).split('\n')[0]
}
out.marker_b_exists = fs.existsSync(marker)
if (fs.existsSync(marker)) { out.marker_b_content = fs.readFileSync(marker, 'utf8').trim(); fs.unlinkSync(marker) }

// 判定实验 C：不用 cmd，直接用一个会写文件的程序（powershell 绝对路径）
try {
  execFileSync(
    String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
    ['-NoProfile', '-Command', `Set-Content -Path '${marker}' -Value 'MARKER-C'`],
    { encoding: 'utf8', env: minimalEnv, cwd: String.raw`C:\Windows` },
  )
  out.exec_c = 'no-error'
} catch (e) {
  out.exec_c = 'threw: ' + String((e as Error).message).split('\n')[0]
}
out.marker_c_exists = fs.existsSync(marker)
if (fs.existsSync(marker)) { out.marker_c_content = fs.readFileSync(marker, 'utf8').trim(); fs.unlinkSync(marker) }

return clean(out)
