# Readme Doctor

验证 README 里的安装与启动命令是否仍然可用，并在 CI 中生成清晰、可定位的报告。

> 当前是 MVP 架构骨架：只识别 `bash`、`sh`、`shell` 和 `console` fenced code block，首先服务 Node.js 仓库。

## 快速开始

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js check README.md
```

上面的命令默认只生成执行计划。加 `--run` 后，命令会在一次性 Docker 沙箱中执行：

```bash
node packages/cli/dist/index.js check README.md --run
```

沙箱默认禁网。如安装步骤确实需要访问包仓库，可显式开放：

```bash
node packages/cli/dist/index.js check README.md --run --network
```

只有在仓库完全可信时，才应绕过 Docker 使用本地 shell：

```bash
node packages/cli/dist/index.js check README.md --run --executor=local
```

## 项目结构

```text
packages/core    Markdown 解析、执行计划、命令执行、报告模型
packages/cli     本地命令行入口
packages/action  GitHub Action 适配层
docs             架构、路线图和安全边界
examples         测试用示例仓库
```

详细设计见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 在 GitHub Actions 中使用

```yaml
name: Verify README

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  readme-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/readme-doctor@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          network: "true"
```

Action 会把报告写入 Job Summary，并在 PR 中创建一条带隐藏标记的评论；后续运行更新同一条评论，不会重复刷屏。fork PR 的 token 通常只有只读权限，评论失败会降级为 warning，检查本身仍正常执行。

可用输出：`passed` 和完整 Markdown `report`。

发布前必须运行 `pnpm build` 并提交 `packages/action/dist/index.js`；GitHub JavaScript Action 不会在用户仓库里自动安装依赖。

## 设计原则

- 核心逻辑不依赖 GitHub，CLI、Action 和未来的 Web 服务共用同一套能力。
- 报告同时提供机器可读 JSON 和人类可读 Markdown。
- 执行 README 命令属于运行不受信任代码，必须显式启用；默认使用无网络、无 Linux capabilities、只读根文件系统的一次性容器。
- MVP 不调用大模型；判断结果尽量可重复、可调试。

## 近期路线

1. 补齐多行 shell 命令与目录切换语义。
2. 增加环境变量缺失检测和 Node 版本矩阵。
3. 用真实开源仓库建立兼容性 fixtures。

## License

MIT
