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
- 所有写入操作都有主进程校验、可理解的失败提示，并在失败时保留用户输入。

## 开发环境

- Node.js 22.12 或更高版本
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

应用启动时由 Electron 主进程在用户数据目录创建 `memory-music.sqlite3`。渲染进程只能通过 `window.memoryMusic.library` 的类型化 API 请求数据，不能直接访问 SQLite。主进程负责输入校验、事务和稳定的成功/错误结果；数据迁移、外键约束、关系操作和持久化重启行为由 `pnpm test` 验证。

当前自动化测试覆盖 Repository/迁移、IPC 服务和核心 Vue 交互。Vue 测试使用 jsdom，SQLite 测试由 Electron 内置 Node 运行，以匹配 `better-sqlite3` 的 native ABI。

真实 Windows SMTC 集成测试默认关闭，避免自动控制个人媒体会话；本地验证方式和已经核验的系统/网易云版本见 [播放适配与 Windows 验证](docs/播放适配与Windows验证.md)。

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
