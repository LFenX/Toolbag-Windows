# Toolbag

Toolbag 是一个面向 Windows 的本地工具工作台。从 v0.2 起，工具是**运行时可加载的插件**：用户通过应用市场扫描 GitHub Registry，即可安装、升级、回滚、卸载工具，无需重新下载主程序。

## 关键能力

- **插件化工具系统**：每个工具是一个签名过的 `.tbpkg` 包，包含 manifest、UI schema 和可选的原生 sidecar。
- **双轨 UI 渲染**：声明式 SchemaForm + ResultRenderer 覆盖 90% 工具类型；少量内置工具走 React 组件通道。
- **NDJSON 子进程协议**：sidecar 可用任何语言编写，通过 stdin/stdout 流式输出进度 / 日志 / 结果。
- **强制 minisign 签名**：Release 构建必须配置公钥；下载即校验。
- **独立更新通道**：应用本体与插件走两套更新链，互不阻塞。
- **专业工作台 UI**：可折叠 sidebar、Ctrl+K 命令面板、深浅主题、强调色、密度、动画偏好、状态栏。

## 技术栈

- 桌面壳：Tauri 2 + Rust
- 前端：React 19 + TypeScript + Vite + TanStack Router + TanStack Query + Zustand
- UI：Tailwind 4 + shadcn/ui 风格组件 + lucide-react
- 存储：SQLite（rusqlite，schema v3）
- 网络：ureq（轻量 HTTP）
- 校验：minisign-verify + sha2 + zip
- 发布：GitHub Release + NSIS + tauri-plugin-updater

## 本地开发

```powershell
corepack pnpm install
corepack pnpm dev
```

运行桌面应用：

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
corepack pnpm tauri:dev
```

## 验证

```powershell
corepack pnpm check
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

## 文档

- [v0.2 方案：插件化与专业化升级](docs/plan-v0.2-plugin-system.md)
- [架构说明](docs/architecture.md)
- [新增工具 / 插件](docs/adding-tool.md)
- [发布流程](docs/release.md)
- [安全边界](docs/security.md)
