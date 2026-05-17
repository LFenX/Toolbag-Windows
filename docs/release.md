# 发布流程

Toolbag 使用 GitHub Release 发布 Windows NSIS 安装包。Release workflow 在 `v*` tag 上触发。

## GitHub 配置

需要配置以下 Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`：Tauri updater 私钥。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：私钥密码，没有密码时可留空。
- `TAURI_UPDATER_PUBKEY`：写入临时 release config 的 updater 公钥。

可选 Repository Variable：

- `TOOLBAG_UPDATER_ENDPOINT`：默认值为 `https://github.com/LFenX/Toolbag-Windows/releases/latest/download/latest.json`。

## 生成签名密钥

在本机执行：

```powershell
corepack pnpm tauri signer generate -- -w "$env:USERPROFILE\.tauri\toolbag.key"
```

把私钥内容保存到 `TAURI_SIGNING_PRIVATE_KEY`，把输出的公钥保存到 `TAURI_UPDATER_PUBKEY`。私钥不要提交到仓库。

## 发布

```powershell
git tag v0.1.0
git push origin v0.1.0
```

workflow 会：

- 安装 pnpm 与 Rust。
- 跑前端和 Rust 检查。
- 根据 Secrets 生成 `src-tauri/tauri.release.conf.json`。
- 使用 `tauri-apps/tauri-action` 以 `--features updater` 构建 NSIS 安装包和 updater artifacts。
- 创建 draft GitHub Release。

## 应用内更新

Release 构建会内置 Tauri updater 公钥和 endpoint，并生成 `latest.json`。发布前先用 draft Release 下载安装包在干净环境试装；确认无误后把 Release 从 draft 改为 published，否则用户端无法访问 `latest.json`，应用内检查更新会失败。

用户可在 Toolbag 的 `设置 > 更新 > 主程序更新` 手动检查并安装更新。若开启“自动检查应用更新”，应用启动后会按设置频率在后台检查，有新版本时弹出更新提示，安装完成后自动重启 Toolbag。
