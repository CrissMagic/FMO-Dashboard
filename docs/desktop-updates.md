# 桌面更新

Actions 工作流 Desktop build and signed updates：手动运行默认仅生成 Artifact；推送 desktop-v2.6.3 标签会发布稳定 Release。标签必须匹配 package.json，更新需递增版本。

Actions Secret TAURI_SIGNING_PRIVATE_KEY 保存专用更新私钥，密码可配置 TAURI_SIGNING_PRIVATE_KEY_PASSWORD。公钥已嵌入 tauri.conf.json。本机备份 release/updater-signing.key 被 Git 忽略，务必安全备份，不能公开。未配置该 Secret 时，CI 可构建安装包，但不能发布签名更新。

配置后生成 NSIS、.sig 与最新稳定 Release 的 latest.json。软件从 CrissMagic/FMO-Dashboard 读取清单，校验签名后安装。此签名与 Windows 代码签名证书不同。

入口：更多 → 软件更新，或顶部菜单检查软件更新。Windows 可检查、阅读说明、下载并安装；安装会退出应用。其他平台提供发布页下载入口。

2.6.2 及更早版本需手动安装一次 2.6.3。首次发布更新清单之前，检查将提示无法获取清单，不会误报最新版。

功能分支和 main 的普通 push 自动构建 Artifact，不发布版本；只有 desktop-v 标签才发布。

标签由维护者先推送，工作流仅针对已存在的版本标签创建 Release，避免 GITHUB_TOKEN 为含工作流修改的提交建标签时权限不足。
