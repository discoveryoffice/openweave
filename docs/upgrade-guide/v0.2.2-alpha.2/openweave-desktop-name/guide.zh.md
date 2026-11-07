---
kind: upgrade-guide
description: 桌面应用包与可执行文件采用 OpenWeave 名称，直接启动路径需要更新。
---

# OpenWeave 桌面名称

[English](guide.md) | 中文

## 变更

桌面产品名称为 OpenWeave。macOS 应用包与可执行文件为 `OpenWeave.app` 和 `Contents/MacOS/OpenWeave`；Windows 可执行文件为 `OpenWeave.exe`。通过路径启动 `DeepSeek Harness.app` 或 `DeepSeek Harness.exe` 的脚本需要修改。Web 安装入口和标题也显示 OpenWeave。

`dsh` 命令、包名、更新产物文件名、应用标识符、`dsh` URL scheme、API 配置及 Session 格式保持不变。已打包的桌面构建保留现有 `DeepSeek Harness` Electron userData 目录，并尊重显式指定的 `--user-data-dir`。

## 迁移

1. 将直接引用应用包或可执行文件的快捷方式与脚本更新为上述 OpenWeave 名称。如果内置 `dsh` 命令的链接指向旧应用包，通过桌面命令菜单重新安装该命令。
2. 启动 OpenWeave，确认模型配置与历史 Session 可用。现有 API Key 和数据目录无需转换。
