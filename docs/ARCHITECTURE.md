# Readme Doctor 架构设计

## 1. 产品边界

Readme Doctor 接收一份 Markdown 文档和一个仓库工作目录，提取可执行示例，在受控环境中运行，并输出能定位到原文行号的验证报告。

MVP 明确不做：自动修复 README、通用 CI 平台、远程代码托管、任意语言包管理器支持。

## 2. 数据流

```text
README.md
   │
   ▼
Markdown Parser ──► Command Blocks ──► Planner ──► Execution Plan
                                                    │
                                                    ▼
                                              Executor Adapter
                                                    │
                                                    ▼
                                             Structured Results
                                                    │
                                ┌───────────────────┴──────────────────┐
                                ▼                                      ▼
                         Markdown Reporter                        JSON Reporter
                                │                                      │
                                ▼                                      ▼
                       PR comment / summary                      CLI / future API
```

## 3. 模块职责

### `@readme-doctor/core`

纯业务核心，不读取 GitHub 上下文：

- `parseMarkdown`：提取 shell fenced block、标题路径和源文件行号。
- `createPlan`：把代码块转换成带稳定 ID 的执行步骤。
- `executePlan`：按顺序执行步骤，处理超时和失败策略。
- `renderMarkdownReport`：生成适合终端与 PR 评论的摘要。

核心依赖倒置在 `CommandExecutor` 接口上。`DockerExecutor` 是默认执行器；`LocalShellExecutor` 只用于受信任仓库的开发调试。

### `@readme-doctor/cli`

负责参数、退出码和 stdout。默认 dry-run，只有 `--run` 才执行命令。

### `@readme-doctor/action`

负责读取 Action 输入、写入 job summary、生成 GitHub annotations，并创建或更新 PR 评论。评论通过隐藏 marker 定位旧报告，避免每次运行新增一条。fork PR 无写权限时只降级评论能力，不改变核心验证结论。发布物由 esbuild 打成单个 JavaScript 文件，不要求消费者安装依赖。

## 4. 核心数据模型

```ts
type CommandBlock = {
  id: string;
  language: "bash" | "sh" | "shell" | "console";
  heading: string | null;
  startLine: number;
  endLine: number;
  commands: Array<{ value: string; sourceLine: number }>;
};

type ExecutionResult = {
  stepId: string;
  status: "passed" | "failed" | "timed_out" | "skipped";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};
```

行号是一级数据，不应只存在于日志文本中。未来生成建议修改或 GitHub annotation 时会依赖它。

## 5. 执行与安全模型

README 命令等价于仓库代码，不能因为它位于 Markdown 就视为安全。

- CLI 默认仅展示计划。
- GitHub workflow 使用 `pull_request`，禁止使用拥有高权限 token 的 `pull_request_target` 执行 PR 代码。
- PR 来源为 fork 时不注入 secrets。
- 默认 executor 使用一次性容器：源码以只读方式挂载，复制到临时内存工作区后执行；容器具有只读基础文件系统、CPU/内存/PID/时间限制，默认禁网并移除所有 Linux capabilities。
- 命令输出需要截断与 secret masking。
- MVP Action 权限建议为 `contents: read`；PR 评论应由独立的低权限汇总 job 完成。

## 6. 配置约定

下一阶段增加根目录 `readme-doctor.config.json`：

```json
{
  "files": ["README.md"],
  "runtime": { "node": ["20", "22", "24"] },
  "execution": {
    "timeoutMs": 120000,
    "network": false,
    "continueOnError": false
  },
  "environment": {
    "required": ["DATABASE_URL"],
    "fixtures": { "DATABASE_URL": "postgres://fixture" }
  }
}
```

配置版本升级前保持向后兼容；不把 CI 专属概念写入核心配置。

## 7. 失败语义

- `0`：全部通过，或 dry-run 成功生成计划。
- `1`：至少一个命令失败。
- `2`：配置或 Markdown 无法解析。
- `3`：执行基础设施异常。

单条命令失败后 MVP 默认停止，避免后续结果被污染；将来可由 `continueOnError` 控制。

## 8. 可演进方向

- 新语言：新增 parser/planner policy，而不是在 CLI 中堆条件。
- 新执行环境：实现 `CommandExecutor`，例如 Docker、Firecracker 或远程 runner。
- SaaS：API 层调用 core 并把执行任务投递到队列；core 不感知数据库。
- 智能修复：作为结果后的可选建议器，不参与 pass/fail 判定。
