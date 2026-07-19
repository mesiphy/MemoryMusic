# 播放适配与 Windows 验证

> 验证日期：2026-07-15<br>
> 适用里程碑：M3<br>
> 验证平台：Windows 11 Pro x64 `10.0.26200`、网易云音乐桌面客户端 `3.1.36.205322`

## 1. 能力边界

MemoryMusic 不实现独立播放器，也不获取、解锁或转发音频资源。播放链路只做两件事：

1. 把资料库中已保存的网易云歌曲 ID 交给本机网易云客户端；
2. 通过 Windows 系统媒体会话读取当前曲目并执行基础播控。

协议唤起与系统媒体会话分别由 `PlaybackAdapter` 和 `MediaSessionAdapter` 承担。搜索、个人标注、SQLite Repository 均不依赖这两个适配器，播放失败也不会触发任何资料库写入。

## 2. 网易云唤起与网页兜底

当前安装的网易云音乐 3.1.36 注册了 `orpheus` URL Scheme。该版本接受以下形式的播放请求：

```text
orpheus://<Base64(UTF-8 JSON)>
```

JSON 负载固定为：

```json
{"cmd":"play","type":"song","id":"<网易云歌曲 ID>","channel":"MemoryMusic"}
```

这是一项针对当前客户端版本的兼容性事实，不是稳定的公开 Web API。适配器只接受纯数字歌曲 ID，并始终同时生成官方歌曲页面：

```text
https://music.163.com/song?id=<网易云歌曲 ID>
```

若操作系统拒绝协议请求（例如客户端未安装、协议处理器未注册或版本改变），适配器会自动打开歌曲网页。即使系统已接受协议，客户端仍可能因为版权、下架、会员、地区或网络原因拒绝播放；因此搜索结果在发起协议请求后仍保留“打开歌曲网页”操作和明确提示。

## 3. Windows SMTC

`WindowsSmtcAdapter` 使用 Windows `GlobalSystemMediaTransportControlsSessionManager` 查找网易云音乐媒体会话，提供：

- 当前曲名、歌手、专辑和播放状态；
- 播放、暂停、上一首和下一首。

实现通过隐藏的非交互 PowerShell 进程执行仓库内固定脚本，不拼接用户输入。PowerShell 将 UTF-8 JSON 编码为 Base64 后输出，Node 端再解码，从而避免中文媒体信息受控制台代码页影响。非 Windows 平台会返回稳定的 `UNSUPPORTED` 结果，Cloud 或 jsdom 测试不会声称验证过真实 SMTC。

## 4. 真实环境结果

### 4.1 协议和歌曲行为

| 网易云歌曲 ID | 观察结果 |
| --- | --- |
| `347230` | 客户端开始播放《海阔天空》/ Beyond，SMTC 状态为 `Playing` |
| `436514312` | 客户端开始播放《成都》/ 赵雷 |
| `28815250` | 客户端开始播放《平凡之路》/ 朴树 |
| `185924` | 客户端被成功唤起，但显示“当前歌曲暂无音源”；个人资料未变化 |

协议处理器拒绝以及网页也无法打开的路径由注入式 opener 自动化覆盖；协议处理器拒绝但网页可打开时会返回 `web` 降级结果。没有为了测试“未安装客户端”而卸载或修改用户现有网易云安装。

### 4.2 媒体会话

在真实网易云会话中依次验证：

- 读取当前曲名、歌手和状态；
- 暂停后状态变为 `Paused`；
- 播放后状态变为 `Playing`；
- 下一首后曲目发生变化；
- 上一首后返回原曲。

带环境开关的集成测试还验证了中文曲名/歌手不包含 Unicode 替换字符，并执行一次幂等暂停。验证结束后恢复了原有网易云曲目和暂停状态。

### 4.3 成品端到端

Windows x64 目录包使用独立临时 `user-data-dir` 启动，完成以下闭环：

1. 收录《海阔天空》并保存网易云 ID `347230`；
2. 搜索命中该歌曲并从结果发起播放；
3. 网易云客户端真实开始播放；
4. MemoryMusic 刷新后显示“海阔天空 / Beyond / 正在播放”；
5. 在 MemoryMusic 内暂停，状态变为“已暂停”；
6. 关闭并重新启动成品，歌曲和平台映射仍存在；
7. 停止测试进程并删除隔离的临时数据目录。

测试没有读取、复制或修改用户的 MemoryMusic 正式数据库。

## 5. 验证命令

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm package:dir

$env:MEMORY_MUSIC_WINDOWS_SMTC_INTEGRATION = '1'
pnpm test -- src/main/__tests__/windows-smtc.integration.test.ts
```

常规测试使用 Mock/注入式 runner，Windows 集成测试默认关闭，避免在 CI 中误操作个人媒体会话。只有显式设置环境变量时才运行真实 SMTC 用例。

## 6. 已知限制与升级检查

- `shell.openExternal` 成功只表示操作系统接受了 URI，不代表客户端最终获得可播放音源；界面因此始终保留网页兜底。
- `orpheus://` 负载可能随网易云客户端升级变化。升级客户端后应重跑本页的四个已知 ID、不可用歌曲、网页兜底和成品端到端检查。
- 未安装/未注册协议处理器由 opener 拒绝路径验证；为保护用户环境，不以卸载现有客户端作为验收手段。
- SMTC 依赖网易云创建系统媒体会话；客户端未运行或未建立会话时，界面会显示无当前歌曲，但离线资料库和搜索仍可使用。
- 本实现不绕过会员、付费、版权、地域或 DRM 限制。
