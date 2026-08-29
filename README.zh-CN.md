<div align="center">

# 🩺 Readme Doctor

### 让 Quick Start 永远说真话。

Readme Doctor 会把 README 中可执行的 Shell 示例变成 CI 检查：在一次性 Docker 沙箱中运行命令，将失败精确定位到 Markdown 行，并在每个 Pull Request 中维护一份不会重复刷屏的最新报告。

[![CI](https://github.com/wqwd1dfse/readme-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/wqwd1dfse/readme-doctor/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/wqwd1dfse/readme-doctor)](https://github.com/wqwd1dfse/readme-doctor/releases/latest)
[![License](https://img.shields.io/github/license/wqwd1dfse/readme-doctor)](LICENSE)
[![Stars](https://img.shields.io/github/stars/wqwd1dfse/readme-doctor?style=flat)](https://github.com/wqwd1dfse/readme-doctor/stargazers)

[English](README.md) · [简体中文](README.zh-CN.md)

</div>

---

构建全绿，不代表 README 没坏。脚本改名、环境变量遗漏、运行时版本变化，或者一条早已失效的复制粘贴命令，都可能毁掉新用户最初的五分钟体验。

Readme Doctor 让文档也进入可测试范围。

## 你会得到什么

| 能力 | 对维护者的价值 |
| --- | --- |
| 🔎 自动发现可执行示例 | 识别 `bash`、`sh`、`shell` 和 `console` fenced code block。 |
| 📍 精确源位置 | 每个结果都带 README 章节和从 1 开始的原始行号。 |
| 🐳 一次性 Docker 沙箱 | 在全新的内存工作区运行示例，避免直接污染宿主机。 |
| 🔒 默认安全执行 | 默认禁网、移除 Linux capabilities、只读根文件系统并限制资源。 |
| 💬 一条持续更新的 PR 评论 | 第一次创建报告，后续运行更新同一条，不在 PR 中刷屏。 |
| 🧾 Job Summary 与 annotations | 在 Actions 中展示完整表格，并把失败标记到 Markdown 原行。 |
| 🔌 工作流输出 | 提供 `passed` 和完整 Markdown `report`，方便后续步骤使用。 |
| 🧪 确定性判断 | 不调用大模型，不做概率式判定；命令能运行就是通过，不能就是失败。 |

## 一眼看懂结果

Readme Doctor 会在终端、GitHub Job Summary 和 PR 评论中生成同样紧凑的报告：

| Status | Line | Section | Command |
| --- | ---: | --- | --- |
| ✅ passed | 18 | 安装 | `pnpm install` |
| ❌ failed | 24 | 快速开始 | `pnpm start` |
| ⏭️ skipped | 31 | 验证 | `curl http://localhost:3000/health` |

失败命令还会成为第 24 行上的 GitHub annotation，审查者可以直接跳到过期说明。

## 5 分钟接入

创建 `.github/workflows/readme-doctor.yml`：

```yaml
name: Verify README

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  readme-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - name: Verify executable README examples
        id: doctor
        uses: wqwd1dfse/readme-doctor@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          # 只有示例必须下载依赖时才开启。
          network: "true"
```

这份配置会自动：

1. 查找 `README.md` 中可执行的 Shell 示例；
2. 把仓库复制到一次性 Docker 工作区；
3. 按文档顺序执行命令，遇到第一个失败即停止；
4. 写入 Job Summary 和行级 annotation；
5. 创建或更新唯一一条 PR 报告评论。

如果示例不需要下载内容，请删除 `network: "true"`，保留更安全的默认设置。

> **来自 fork 的 Pull Request：** GitHub 通常只向 fork 的 `pull_request` 工作流提供只读 token。验证和 Job Summary 仍能工作；没有评论写权限时，PR 评论功能会自动降级为 warning。

## 哪些内容会被执行？

Readme Doctor 当前识别四种 fenced-code 语言：

- `bash`
- `sh`
- `shell`
- `console`

在 `bash`、`sh` 和 `shell` 块中，每一条非空、非注释行都会成为命令。在 `console` 块中，只有以 `$ ` 开头的行是命令，输出行会被忽略。

例如，下面这段 Markdown 表示两条命令：

<pre><code>&#96;&#96;&#96;console
$ pnpm install
Packages: +42
$ pnpm test
Tests: 18 passed
&#96;&#96;&#96;</code></pre>

距离最近的上一个 Markdown 标题会成为报告章节；原始行号会贯穿解析、执行、报告和 GitHub annotation 的全过程。

## 常用配置

### 验证其他 Markdown 文件

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    file: docs/getting-started.md
```

### 在子目录运行

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    file: README.md
    working-directory: packages/sdk
```

### 使用其他运行时镜像

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    image: python:3.13-slim
    network: "true"
```

### 只生成计划，不执行命令

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    run: "false"
```

### 使用 Action 输出

```yaml
- name: Verify README
  id: doctor
  uses: wqwd1dfse/readme-doctor@v1

- name: Use the result
  if: always()
  env:
    README_PASSED: ${{ steps.doctor.outputs.passed }}
  run: echo "README passed: $README_PASSED"
```

## 输入参数

| 输入 | 默认值 | 说明 |
| --- | --- | --- |
| `file` | `README.md` | 要检查的 Markdown 文件，相对于 `working-directory`。 |
| `working-directory` | `.` | 命令执行所在的仓库目录。 |
| `run` | `true` | 是否执行发现的命令；设为 `false` 时只生成计划。 |
| `executor` | `docker` | 执行后端。只有完全可信的仓库才应使用 `local`。 |
| `network` | `false` | 是否允许 Docker 沙箱访问网络。 |
| `image` | `node:24-bookworm-slim` | 验证使用的 Docker 镜像。 |
| `timeout-ms` | `120000` | 每条命令的超时时间，单位为毫秒。 |
| `comment` | `true` | 当事件上下文和权限允许时，创建或更新 PR 评论。 |
| `token` | — | PR 评论使用的 GitHub token，通常为 `${{ secrets.GITHUB_TOKEN }}`。 |

## 输出参数

| 输出 | 说明 |
| --- | --- |
| `passed` | 所有已执行命令均通过时为 `true`。 |
| `report` | 完整 Markdown 报告，可用于后续步骤、artifact 或通知。 |

## 沙箱模型

执行 README 命令，本质上就是执行仓库代码。Readme Doctor 将其视为安全敏感操作。

默认 Docker executor 会：

- 以只读方式把 checkout 后的仓库挂载到 `/source`；
- 执行前复制到全新的 `/workspace` tmpfs；
- 使用只读容器根文件系统；
- 默认禁用网络，只有显式配置才开启；
- 移除全部 Linux capabilities；
- 启用 `no-new-privileges`；
- 将容器限制为 2 CPU、2 GB 内存、256 PID 和 1 GB 工作区；
- 为每条命令应用超时；
- 将保留的命令输出限制在固定大小；
- 无论通过还是失败，计划结束后都会强制删除一次性容器。

这些措施属于纵深防御，不能代替 runner 本身的隔离。对于不可信贡献，请使用一次性 runner；不要向 fork 代码暴露 secrets，也不要通过 `pull_request_target` 执行 PR 代码。

## 本地 CLI

仓库包含用于开发和调试的 CLI，目前尚未发布为 npm 包。

克隆并构建：

```text
git clone https://github.com/wqwd1dfse/readme-doctor.git
cd readme-doctor
pnpm install
pnpm build
```

只查看命令计划：

```text
node packages/cli/dist/index.js check README.md
```

使用默认 Docker 沙箱执行：

```text
node packages/cli/dist/index.js check README.md --run
```

允许沙箱联网下载：

```text
node packages/cli/dist/index.js check README.md --run --network
```

只有完全信任仓库时才使用宿主 shell：

```text
node packages/cli/dist/index.js check README.md --run --executor=local
```

## 最适合的项目

Readme Doctor 特别适合：

- 带有复制粘贴安装片段的 SDK 和库；
- starter template 与项目生成器；
- Quick Start 步骤较多的开发者工具；
- 必须与持续变化的 CLI 保持同步的教程；
- 包含新成员入职说明的内部平台仓库；
- 文档更新频繁的开源项目。

## 当前限制

Readme Doctor 目前刻意保持小而明确：

- 尚不会拼接多行 Shell 命令；
- `cd`、`export` 等 Shell 状态不会在单独命令行之间保留；
- 命令按顺序执行，并在第一个失败处停止；
- 只识别 Shell/console fenced block；
- 暂无项目配置文件和环境变量 fixture 系统；
- fork PR 评论取决于 GitHub token 权限。

明确这些限制，是为了让一份绿色报告具有可预测的含义。

## 项目结构

```text
packages/core    Markdown 解析、计划、executor 和报告
packages/cli     本地命令行适配层
packages/action  GitHub Action 适配层与已打包发布物
docs             架构和安全边界
examples         小型兼容性 fixture
```

模块边界、数据流、失败语义和执行模型详见[架构文档](docs/ARCHITECTURE.md)。

## 路线图

- 多行 Shell 命令支持；
- 持久化目录和环境变量语义；
- 必需环境变量检测与 fixture；
- Node.js 运行时矩阵；
- 来自真实开源仓库的兼容性 fixture；
- 发布 npm CLI 包。

## 参与贡献

欢迎 Issue 和范围明确的 Pull Request。一份有用的 bug 报告应包含：

1. 被错误解释的 Markdown 块；
2. 预期命令计划；
3. 实际报告；
4. 操作系统、Docker 版本和 Action/CLI 版本。

提交 PR 前请运行：

```text
pnpm install
pnpm build
pnpm test
```

## 版本策略

使用 `@v1` 可获得当前主版本内的兼容更新。如果希望工作流始终停留在同一个发行版，请使用 `@v1.0.0` 等精确版本标签。

## License

[MIT](LICENSE)
