# Toolbag

Toolbag 是一个面向 Windows 的本地工具工作台。项目当前只搭框架，首个内置工具是只读的“环境概览”，用于验证工具注册、路由、Rust IPC、SQLite 设置、日志导出和发布链路。

## 技术栈

- 桌面壳：Tauri 2 + Rust
- 前端：React 19 + TypeScript + Vite + TanStack Router + TanStack Query
- UI：Tailwind CSS + shadcn/ui 风格组件 + lucide-react
- 存储：Rust 管理本地 SQLite
- 发布：GitHub Release + NSIS，预留 Tauri updater artifacts

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

- [架构说明](docs/architecture.md)
- [新增工具](docs/adding-tool.md)
- [发布流程](docs/release.md)
- [安全边界](docs/security.md)
