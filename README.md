<div align="center">

# 🩺 Readme Doctor

### Keep your Quick Start honest.

Readme Doctor turns executable shell examples in your README into CI checks. It runs them in a disposable Docker sandbox, points failures back to the exact Markdown line, and keeps one up-to-date report on every pull request.

[![CI](https://github.com/wqwd1dfse/readme-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/wqwd1dfse/readme-doctor/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/wqwd1dfse/readme-doctor)](https://github.com/wqwd1dfse/readme-doctor/releases/latest)
[![License](https://img.shields.io/github/license/wqwd1dfse/readme-doctor)](LICENSE)
[![Stars](https://img.shields.io/github/stars/wqwd1dfse/readme-doctor?style=flat)](https://github.com/wqwd1dfse/readme-doctor/stargazers)

[English](README.md) · [简体中文](README.zh-CN.md)

</div>

---

Your build can be green while your README is broken. A renamed script, missing environment variable, unsupported runtime, or stale copy-paste command is enough to ruin a new user's first five minutes.

Readme Doctor makes documentation part of the test surface.

## What you get

| Capability | What it means for maintainers |
| --- | --- |
| 🔎 Executable example discovery | Finds commands in `bash`, `sh`, `shell`, and `console` fenced blocks. |
| 📍 Exact source locations | Every result includes the README section and 1-based line number. |
| 🐳 Disposable Docker sandbox | Runs examples away from the host with a fresh in-memory workspace. |
| 🔒 Secure-by-default execution | No network, no Linux capabilities, read-only root filesystem, and resource limits by default. |
| 💬 One persistent PR comment | Creates a report once, then updates it on later runs instead of spamming the PR. |
| 🧾 Job Summary and annotations | Shows the full table in Actions and places failures directly on Markdown lines. |
| 🔌 Workflow outputs | Exposes `passed` and the complete Markdown `report` for downstream steps. |
| 🧪 Deterministic checks | No LLM and no probabilistic pass/fail decision. A command either works or it does not. |

## See the result at a glance

Readme Doctor produces the same compact report in the terminal, GitHub Job Summary, and pull request comment:

| Status | Line | Section | Command |
| --- | ---: | --- | --- |
| ✅ passed | 18 | Install | `pnpm install` |
| ❌ failed | 24 | Quick Start | `pnpm start` |
| ⏭️ skipped | 31 | Verify | `curl http://localhost:3000/health` |

The failed command also becomes a GitHub annotation on line 24, so reviewers can jump straight to the stale instruction.

## Add it to a repository in 5 minutes

Create `.github/workflows/readme-doctor.yml`:

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
          # Enable only when examples must download dependencies.
          network: "true"
```

That is enough to:

1. find executable shell examples in `README.md`;
2. copy the repository into a disposable Docker workspace;
3. run commands in document order and stop on the first failure;
4. write a Job Summary and line annotations;
5. create or update one PR report comment.

For examples that do not need downloads, remove `network: "true"` and keep the safer default.

> **Fork pull requests:** GitHub normally gives `pull_request` workflows a read-only token on forks. Verification and Job Summary still work; PR commenting gracefully degrades to a warning when write permission is unavailable.

## What counts as an executable example?

Readme Doctor currently recognizes four fenced-code languages:

- `bash`
- `sh`
- `shell`
- `console`

In `bash`, `sh`, and `shell` blocks, every non-empty, non-comment line becomes a command. In `console` blocks, only lines beginning with `$ ` are commands; output lines are ignored.

For example, this Markdown represents two commands:

<pre><code>&#96;&#96;&#96;console
$ pnpm install
Packages: +42
$ pnpm test
Tests: 18 passed
&#96;&#96;&#96;</code></pre>

The nearest preceding Markdown heading becomes the report section, and the original line number travels through parsing, execution, reporting, and GitHub annotations.

## Common configurations

### Verify another Markdown file

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    file: docs/getting-started.md
```

### Run in a subdirectory

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    file: README.md
    working-directory: packages/sdk
```

### Use a different runtime image

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    image: python:3.13-slim
    network: "true"
```

### Generate a plan without executing commands

```yaml
- uses: wqwd1dfse/readme-doctor@v1
  with:
    run: "false"
```

### Consume Action outputs

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

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `file` | `README.md` | Markdown file to inspect. Relative to `working-directory`. |
| `working-directory` | `.` | Repository directory in which commands run. |
| `run` | `true` | Execute discovered commands. Set to `false` for plan-only mode. |
| `executor` | `docker` | Execution backend. `local` is available only for fully trusted repositories. |
| `network` | `false` | Allow network access inside the Docker sandbox. |
| `image` | `node:24-bookworm-slim` | Docker image used for verification. |
| `timeout-ms` | `120000` | Timeout for each command, in milliseconds. |
| `comment` | `true` | Create or update a PR comment when event context and permissions allow it. |
| `token` | — | GitHub token used for PR comments. Usually `${{ secrets.GITHUB_TOKEN }}`. |

## Outputs

| Output | Description |
| --- | --- |
| `passed` | `true` when every executed command passed. |
| `report` | Complete Markdown report suitable for another step, artifact, or notification. |

## The sandbox model

Executing README commands means executing repository code. Readme Doctor treats that as a security-sensitive operation.

The default Docker executor:

- mounts the checked-out repository read-only at `/source`;
- copies it into a fresh `/workspace` tmpfs before execution;
- uses a read-only container root filesystem;
- disables network access unless explicitly enabled;
- drops all Linux capabilities;
- enables `no-new-privileges`;
- limits the container to 2 CPUs, 2 GB memory, 256 PIDs, and a 1 GB workspace;
- applies a per-command timeout;
- truncates retained command output to a bounded size;
- force-removes the disposable container after the plan completes or fails.

This is defense in depth, not a substitute for runner isolation. Use ephemeral runners for untrusted contributions, never expose secrets to fork code, and do **not** execute pull-request code through `pull_request_target`.

## Local CLI

The repository includes a CLI for development and debugging. It is not yet published as an npm package.

Clone and build:

```text
git clone https://github.com/wqwd1dfse/readme-doctor.git
cd readme-doctor
pnpm install
pnpm build
```

Plan commands without running them:

```text
node packages/cli/dist/index.js check README.md
```

Run in the default Docker sandbox:

```text
node packages/cli/dist/index.js check README.md --run
```

Allow downloads inside the sandbox:

```text
node packages/cli/dist/index.js check README.md --run --network
```

Use the host shell only for a repository you fully trust:

```text
node packages/cli/dist/index.js check README.md --run --executor=local
```

## Where it fits best

Readme Doctor is especially useful for:

- SDKs and libraries with copy-paste installation snippets;
- starter templates and project generators;
- developer tools with multi-step Quick Starts;
- tutorials that must stay synchronized with a changing CLI;
- internal platform repositories with onboarding instructions;
- open-source projects receiving frequent documentation changes.

## Current limitations

Readme Doctor is intentionally small and explicit today:

- multiline shell commands are not yet joined;
- shell state such as `cd` and `export` does not persist between individual command lines;
- commands run sequentially and execution stops on the first failure;
- only shell/console fenced blocks are recognized;
- there is no project configuration file or environment-variable fixture system yet;
- PR comments on fork contributions depend on GitHub token permissions.

These limits are documented so a green report means something predictable.

## Project structure

```text
packages/core    Markdown parsing, plans, executors, and reports
packages/cli     Local command-line adapter
packages/action  GitHub Action adapter and bundled release artifact
docs             Architecture and security boundaries
examples         Small compatibility fixtures
```

Read the [architecture document](docs/ARCHITECTURE.md) for module boundaries, data flow, failure semantics, and the execution model.

## Roadmap

- multiline shell command support;
- persistent directory and environment semantics;
- required environment-variable detection and fixtures;
- Node.js runtime matrices;
- compatibility fixtures from real open-source repositories;
- a published npm CLI package.

## Contributing

Issues and focused pull requests are welcome. A useful bug report includes:

1. the Markdown block that was interpreted incorrectly;
2. the expected command plan;
3. the actual report;
4. operating system, Docker version, and Action/CLI version.

Before opening a pull request:

```text
pnpm install
pnpm build
pnpm test
```

## Versioning

Pin `@v1` for compatible updates within the current major version. Use an exact version tag such as `@v1.0.0` when you want the workflow reference to stay on one release.

## License

[MIT](LICENSE)
