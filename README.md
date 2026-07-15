# MemoryMusic

MemoryMusic 是一个本地优先的个人音乐记忆与检索工具。当前仓库使用 Electron、Vue 3、TypeScript 和 pnpm 构建 Windows 桌面应用。

## 开发环境

- Node.js 22.12 或更高版本
- pnpm 10 或更高版本

## 常用命令

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm build` 只生成 Electron 主进程、预加载脚本和渲染层的生产构建。Windows 安装包可在 Windows 本地通过 `pnpm package:win` 生成。

## 平台边界

Cloud 环境适合验证 Vue 界面、TypeScript 领域逻辑、SQLite 与搜索模块。以下能力必须在 Windows 本地验证：

- 网易云音乐桌面客户端集成；
- `orpheus://` 协议唤起；
- Windows SMTC 媒体会话；
- Windows Credential Manager；
- Windows 安装包。

产品定位与路线见 [产品定位报告](docs/产品定位报告.md)。
