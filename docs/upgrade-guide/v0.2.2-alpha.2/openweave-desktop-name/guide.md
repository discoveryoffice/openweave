---
kind: upgrade-guide
description: Desktop application bundles and executables use the OpenWeave name, requiring updates to direct launch paths.
---

# OpenWeave desktop name

English | [中文](guide.zh.md)

## Change

The desktop product name is OpenWeave. The macOS bundle and executable are `OpenWeave.app` and `Contents/MacOS/OpenWeave`; the Windows executable is `OpenWeave.exe`. Scripts that launch `DeepSeek Harness.app` or `DeepSeek Harness.exe` by path must change. Web install entries and titles also display OpenWeave.

The `dsh` command, package names, update artifact basenames, application identifier, `dsh` URL scheme, API configuration, and Session format remain unchanged. Packaged desktop builds retain the existing `DeepSeek Harness` Electron userData directory; explicit `--user-data-dir` overrides are respected.

## Migration

1. Update shortcuts and scripts that refer directly to the application bundle or executable to the OpenWeave names above. Reinstall the bundled `dsh` command through the desktop command menu if its link points to the old bundle.
2. Start OpenWeave and confirm that model settings and previous Sessions are available. Existing API keys and data directories require no conversion.
