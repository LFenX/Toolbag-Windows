# Toolbag

Toolbag 是一个面向 Windows 的本地工具工作台。它用 Tauri 2 + Rust 承载系统能力和插件运行时，用 React + TypeScript 构建工作台界面，目标是在一个安全、可扩展的桌面应用里管理常用诊断、开发和系统工具。

当前主仓版本为 `0.3.3`。项目已经从“工具编译进主程序”的形态演进为“运行时可安装插件”的架构：应用本体负责工作台、权限边界、数据库、更新和插件生命周期，具体工具可以通过 `.tbpkg` 包独立安装、升级和卸载。

## 主要能力

- **Windows 本地工作台**：提供侧边栏、标签页、状态栏、命令面板、设置、日志、关于页和工具详情页。
- **插件市场**：从 Toolbag Registry 拉取插件索引，支持远程、缓存和内置兜底来源。
- **已安装插件管理**：支持查看、启用、禁用、卸载插件，并展示权限、风险等级、运行记录和版本信息。
- **声明式工具 UI**：普通插件通过 `ui.json` 渲染表单和结果区，覆盖文本、数字、开关、选择器、文件/文件夹选择、日志、表格、进度等常见工具界面。
- **Sidecar 运行时**：插件可以携带任意语言编写的 Windows x64 可执行文件，通过 stdin/stdout NDJSON 协议与应用通信。
- **持久 sidecar 会话**：除一次性命令外，也支持长期运行的插件进程，用于终端、多会话管理等需要保持状态的工具。
- **安全发布链路**：插件包使用 sha256 + minisign 校验；应用本体使用 Tauri updater 与 GitHub Release 发布。
- **内置工具**：当前随应用内置 `环境概览`，用于查看 Toolbag、系统、硬件、网络、服务、进程和环境变量等只读信息。

## 技术栈

- 桌面壳：Tauri 2、Rust 2021
- 前端：React 19、TypeScript、Vite、TanStack Router、TanStack Query、Zustand
- UI：Tailwind CSS 4、shadcn 风格组件、lucide-react
- 终端能力：xterm.js
- 本地存储：SQLite（`rusqlite`）
- 插件与更新：zip、sha2、minisign-verify、semver、ureq、tauri-plugin-updater
- 测试与质量：Vitest、Testing Library、ESLint、Cargo test/fmt/clippy

## 仓库结构

```text
src/
├── app/                    # 应用壳、路由、主题、工作区状态
├── features/
│   ├── workbench/          # 默认工作台
│   ├── marketplace/        # 插件市场
│   ├── plugins/            # 已安装插件管理
│   ├── tools/              # 工具运行容器、内置 renderer、声明式 runtime
│   ├── settings/           # 设置页
│   ├── logs/               # 日志页
│   └── about/              # 关于页
└── shared/                 # UI primitives、工具函数、Tauri 调用封装

src-tauri/
├── src/
│   ├── plugins/            # 插件 manifest、registry、installer、runner、权限、签名
│   ├── commands.rs         # Tauri invoke 命令入口
│   ├── database.rs         # SQLite schema 与持久化
│   ├── environment.rs      # 环境概览内置工具
│   └── updates.rs          # 应用更新
└── resources/
    ├── bundled-plugins/    # 随应用打包的内置插件
    └── registry-bundled.json
```

## 插件模型

一个插件包是 `.tbpkg` 文件，本质上是 zip 包。典型内容包括：

```text
tool.json                  # 插件清单，必需
ui.json                    # 声明式 UI，普通插件必需
icon.svg                   # 可选
README.md                  # 可选
changelog.md               # 可选
bin/sidecar-windows-x64.exe
assets/
```

`tool.json` 描述插件 ID、版本、分类、风险等级、权限、运行时和命令。运行时支持：

| runtime.kind | 执行位置 | UI 形态 | 适用场景 |
| --- | --- | --- | --- |
| `none` | 前端 | SchemaForm + ResultRenderer | 纯前端计算或文本变换 |
| `sidecar` | 插件子进程 | SchemaForm + ResultRenderer，或官方内置 renderer | 文件处理、系统调用、外部 API、长会话工具 |
| `builtin` | Rust 主进程 | 主程序内置 React 组件 | 主仓维护的内置工具 |

Sidecar 与应用之间使用 NDJSON 帧通信，支持 `ready`、`progress`、`log`、`event`、`result`、`error`、`cancel` 和 `shutdown` 等消息。插件开发细节见 [docs/adding-tool.md](docs/adding-tool.md)。

## 本地开发

准备环境：

- Windows 10/11
- Node.js 22
- Corepack + pnpm 11.0.9
- Rust stable
- Tauri 2 所需 Windows 构建工具

安装依赖：

```powershell
corepack enable
corepack pnpm install
```

运行前端开发服务器：

```powershell
corepack pnpm dev
```

运行桌面应用：

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
corepack pnpm tauri:dev
```

构建前端：

```powershell
corepack pnpm build
```

构建 Tauri 安装包：

```powershell
corepack pnpm tauri:build
```

## 验证

前端完整检查：

```powershell
corepack pnpm check
```

Rust 检查：

```powershell
Push-Location src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
Pop-Location
```

CI 在 Windows 上执行同一套前端与 Rust 检查。

## 发布

应用本体通过 GitHub Release 发布 Windows NSIS 安装包。打 `v*` tag 后会触发 `.github/workflows/release.yml`：

1. 安装 Node、pnpm 和 Rust。
2. 执行前端与 Rust 检查。
3. 生成 Tauri updater release 配置。
4. 校验 `TOOLBAG_PLUGIN_PUBKEY`。
5. 使用 `tauri-apps/tauri-action` 构建并发布 release。

发布前需要在 GitHub 配置 updater 签名密钥和插件 minisign 公钥。完整流程见 [docs/release.md](docs/release.md)。

## 相关文档

- [架构说明](docs/architecture.md)
- [新增工具 / 插件](docs/adding-tool.md)
- [安全边界](docs/security.md)
- [发布流程](docs/release.md)
- [v0.2 插件系统方案](docs/plan-v0.2-plugin-system.md)
- [v0.2 收尾指南](docs/v0.2-completion-guide.md)
