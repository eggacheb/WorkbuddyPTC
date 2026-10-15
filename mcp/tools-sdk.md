## Writing code for run_code

`run_code` takes two required arguments: `code` — the body of an async TypeScript function (erasable syntax only — no `enum` or namespaces; type annotations are advisory, the code runs type-stripped) — and `description`, a short summary of what the program does. The declarations below are SDK bindings for this program. A declaration does not make its name a directly callable tool; only names supplied as separate tool schemas may be called directly.

Inside the program:

- Call tools as `await tools.name(args)` — quoted access for exotic names: `tools["my-tool"](args)`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with `ToolCallError`, whose `toolName` identifies the failed tool and whose `message` is human-readable — `try/catch` it to handle and continue.
- Independent read-only calls MAY overlap under `Promise.all` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with `await`.
- Emit results with `return` and/or `console.log(...)`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

Program-only SDK bindings:

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

interface ToolArgsMap {
  /** Edit an existing UTF-8 text file by replacing literal text. */
  edit: {
    /** Path to edit, resolved by the filesystem backend. */
    file_path: string;
    /** Literal text to replace. */
    old_string: string;
    /** Literal replacement text. Use an empty string to delete the match. */
    new_string: string;
    /** Replace all matches. Defaults to false; when false, old_string must appear exactly once. */
    replace_all?: boolean;
  } & Record<string, JsonValue>;
  /** Find files, not directories, whose paths match a glob pattern, including hidden and ignored files. Returns up to 100 paths in modification-time order; a larger result keeps the first paths and reports where the complete list was saved. */
  glob: {
    /** Glob pattern to match file paths against (e.g. "**\/*.ts", "src/**\/*.test.js"). A pattern with no "/" matches the basename at any depth, so "*" and "*.ts" both search the whole tree; include a separator to anchor the depth. */
    pattern: string;
    /** Directory to search in. Defaults to the session workspace; a relative path resolves against it. */
    path?: string;
  } & Record<string, JsonValue>;
  /** Search file contents with a ripgrep regular expression. Returns matching lines with line numbers, grouped by file. Returns up to 250 matches; a larger result reports where the complete match list was saved. */
  grep: {
    /** Regular expression to search for (ripgrep syntax). */
    pattern: string;
    /** File or directory to search. Defaults to the session workspace; a relative path resolves against it. */
    path?: string;
    /** One glob filter for which files to search (e.g. "*.ts", "*.{js,jsx}"). Not a list; negation is not supported. */
    include?: string;
  } & Record<string, JsonValue>;
  /** Find regular files below path using explicit include/exclude glob patterns. Symlinks, reparse points, hidden files and .git are not traversed. */
  ops_glob: {
    path?: string;
    pattern: string[];
    outputMode?: "paths" | "details";
    sort?: "path" | "modified";
    offset?: number;
    limit?: number;
  };
  /** Search UTF-8 files below path with Rust regex, bounded output, paging and optional line context. */
  ops_grep: {
    path?: string;
    pattern: string;
    glob?: string[];
    outputMode?: "files_with_matches" | "content" | "count" | "summary";
    caseInsensitive?: boolean;
    lineNumbers?: boolean;
    beforeContext?: number;
    afterContext?: number;
    multiline?: boolean;
    offset?: number;
    limit?: number;
  };
  /** Read bounded UTF-8 text lines or a hex view from path relative to the DSH session cwd. Directories are rejected; use ops_glob or ops_grep. */
  ops_inspect_local_file: {
    path?: string;
    offset?: number;
    limit?: number;
    encoding?: "utf-8";
    view?: "text" | "hex";
  };
  /** Perform a deterministic UTF-8 replacement under path. dryRun observes only; writes use revision checks and atomic replacement. Read-only sessions are rejected. */
  ops_replace: {
    path?: string;
    pattern: string;
    replacement: string;
    glob?: string[];
    maxReplacements?: number;
    dryRun?: boolean;
  };
  /** Run commands in a PowerShell shell * When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped. * You don't have access to the internet via this tool. * State is persistent across command calls and discussions with the user. * Use native Windows paths (C:\...) and $env:NAME variables; this is PowerShell, not bash. * Please avoid commands that may produce a very large amount of output. * Please run long lived commands in the background, e.g. 'Start-Job' or start a server with Start-Process. */
  pwsh: {
    /** The PowerShell command to run. Relative path is preferred in the command. */
    command: string;
  } & Record<string, JsonValue>;
  /** Read a UTF-8 text file and return line-numbered content. */
  read: {
    /** Path to read, resolved by the filesystem backend. */
    file_path: string;
    /** 1-based first line to return. Defaults to 1. */
    offset?: number;
    /** Maximum number of lines to return. Defaults to 2000. */
    limit?: number;
  } & Record<string, JsonValue>;
  /** Create or fully replace a UTF-8 text file. */
  write: {
    /** Path to write, resolved by the filesystem backend. */
    file_path: string;
    /** Full UTF-8 text content to write. */
    content: string;
  } & Record<string, JsonValue>;
}

interface ToolOutputMap {
  edit: {
    path: string;
    before: string;
    after: string;
  };
  glob: {
    root: string;
    paths: string[];
  };
  grep: {
    matches: {
      path: string;
      lineNumber: number;
      line: string;
    }[];
  };
  ops_glob: {
    status?: string;
    phase?: string;
    changed?: number;
    matched?: number;
    skipped?: number;
    failed?: number;
    complete?: boolean;
    omitted?: number;
    total?: number;
    nextOffset?: number;
    truncated?: boolean;
    items?: JsonValue[];
    dryRun?: boolean;
    files?: number;
    matches?: number;
    error?: Record<string, JsonValue>;
  } & Record<string, JsonValue>;
  ops_grep: {
    status?: string;
    phase?: string;
    changed?: number;
    matched?: number;
    skipped?: number;
    failed?: number;
    complete?: boolean;
    omitted?: number;
    total?: number;
    nextOffset?: number;
    truncated?: boolean;
    items?: JsonValue[];
    dryRun?: boolean;
    files?: number;
    matches?: number;
    error?: Record<string, JsonValue>;
  } & Record<string, JsonValue>;
  ops_inspect_local_file: {
    status?: string;
    phase?: string;
    changed?: number;
    matched?: number;
    skipped?: number;
    failed?: number;
    complete?: boolean;
    omitted?: number;
    total?: number;
    nextOffset?: number;
    truncated?: boolean;
    items?: JsonValue[];
    dryRun?: boolean;
    files?: number;
    matches?: number;
    error?: Record<string, JsonValue>;
  } & Record<string, JsonValue>;
  ops_replace: {
    status?: string;
    phase?: string;
    changed?: number;
    matched?: number;
    skipped?: number;
    failed?: number;
    complete?: boolean;
    omitted?: number;
    total?: number;
    nextOffset?: number;
    truncated?: boolean;
    items?: JsonValue[];
    dryRun?: boolean;
    files?: number;
    matches?: number;
    error?: Record<string, JsonValue>;
  } & Record<string, JsonValue>;
  pwsh: string;
  read: {
    path: string;
    offset: number;
    lines: {
      number: number;
      text: string;
    }[];
    totalLines: number;
  };
  write: {
    path: string;
    operation: "create" | "update";
    before: string | null;
    after: string;
  };
}

type ToolName = keyof ToolOutputMap

declare class ToolCallError extends Error {
  readonly name: "ToolCallError";
  readonly toolName: ToolName;
}

declare const tools: {
  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;
}
```