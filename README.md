# MemoryMusic

MemoryMusic 是一个本地优先的个人音乐记忆与检索工具。当前仓库使用 Electron、Vue 3、TypeScript 和 pnpm 构建 Windows 桌面应用。

## 当前能力

- 手工收录和编辑歌曲，可选填网易云原始歌曲 ID 或链接；
- 创建、复用、编辑、删除与合并标签，并为歌曲多选关联；
- 为歌曲保存多条带时间感悟，以及别名、错记歌词和其他召回线索；
- 记录包含时间、地点、人物和描述的事件，并把一个事件关联到多首歌曲；
- 统一搜索歌名、歌手、专辑及全部个人字段，显示字段级命中原因并为短关键词提供包含匹配；
- 从搜索结果唤起网易云音乐，协议处理器失败时自动降级到官方歌曲网页；
- 读取 Windows 媒体会话中的当前歌曲，并执行播放、暂停、上一首和下一首；
- 通过 `Ctrl+Shift+M` 唤起快速记录小窗，只输入一个标签、一句话或直接放入待整理箱；
- 通过官方 `@music163/ncm-cli` 执行可分页、可恢复、幂等的真实收藏导入，并保证平台状态不会覆盖个人字段；
- 所有写入操作都有主进程校验、可理解的失败提示，并在失败时保留用户输入。

收藏导入已用 125 首 Mock 收藏和至少 100 首真实收藏分别验证，覆盖分页续传、重复同步、关闭重开和个人资料保留。应用只调用官方 CLI，不直接调用个人开发者不获支持的 HTTP API，也不读取或复制 CLI 管理的私钥和登录令牌。

首次使用真实收藏导入前，请在同一 Windows 账号下按官方说明配置 `@music163/ncm-cli@0.1.6`，执行 `npx @music163/ncm-cli@0.1.6 login` 并由本人扫码，再用 `npx @music163/ncm-cli@0.1.6 login --check` 确认登录。MemoryMusic 会优先使用已安装的 `ncm-cli`，并可通过 `pnpm dlx` 或 `npx` 调用固定版本。

## 开发环境

- Node.js 22.13 或更高版本
- pnpm 10 或更高版本

## 常用命令

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` 只生成 Electron 主进程、预加载脚本和渲染层的生产构建。Windows 安装包可在 Windows 本地通过 `pnpm package:win` 生成。

## 本地数据

应用启动时由 Electron 主进程在用户数据目录创建 `memory-music.sqlite3`。渲染进程只能通过类型化的 `window.memoryMusic` API 请求资料库、播放、导入和快速记录能力，不能直接访问 SQLite。主进程负责输入校验、事务和稳定的成功/错误结果；数据迁移、外键约束、关系操作和持久化重启行为由 `pnpm test` 验证。

当前自动化测试覆盖 Repository/迁移、IPC 服务和核心 Vue 交互。Vue 测试使用 jsdom，SQLite 测试由 Electron 内置 Node 运行，以匹配 `better-sqlite3` 的 native ABI。

真实 Windows SMTC 集成测试默认关闭，避免自动控制个人媒体会话；本地验证方式和已经核验的系统/网易云版本见 [播放适配与 Windows 验证](docs/播放适配与Windows验证.md)。
真实网易云 CLI 导入测试也默认关闭，避免常规测试访问个人账号；其隔离数据库运行方式见 [网易云导入与快速记录验证](docs/网易云导入与快速记录验证.md)。

## 平台边界

Cloud 环境适合验证 Vue 界面、TypeScript 领域逻辑、SQLite 与搜索模块。以下能力必须在 Windows 本地验证：

- 网易云音乐桌面客户端集成；
- `orpheus://` 协议唤起；
- Windows SMTC 媒体会话；
- Windows Credential Manager；
- Windows 安装包。

产品定位见 [产品定位报告](docs/产品定位报告.md)，阶段安排见 [产品开发行动计划](docs/产品开发行动计划.md)。
搜索索引、排序与初始查询基线见 [搜索设计与忘歌测试集](docs/搜索设计与忘歌测试集.md)。
播放协议、网页兜底、SMTC 与真机结果见 [播放适配与 Windows 验证](docs/播放适配与Windows验证.md)。
官方 CLI 审计、导入边界、Credential Manager 与快速记录真机结果见 [网易云导入与快速记录验证](docs/网易云导入与快速记录验证.md)。
