import {
  NeteaseDataAdapterError,
  type NeteaseAdapterAvailability,
  type NeteaseDataAdapter,
  type NeteaseFavoriteTrack,
  type NeteaseFavoritesPage
} from './netease-data-adapter'
import {
  NCM_CLI_PACKAGE_SPEC,
  runNcmCliCommand,
  type NcmCliCommandResult,
  type NcmCliCommandRunner
} from './ncm-cli-runner'

const PAGE_SIZE = 100
const COMPLETE_CHECKPOINT = 'ncm-cli:v1:complete'
const OFFSET_CURSOR_PREFIX = 'ncm-cli:v1:offset:'
const CLI_NOT_FOUND_REASON = `未找到网易云官方 CLI；请先安装 Node.js，再运行 npx ${NCM_CLI_PACKAGE_SPEC} login`
const CLI_LOGIN_REASON = `网易云官方 CLI 尚未登录；请先运行 npx ${NCM_CLI_PACKAGE_SPEC} login`

interface FavoritePlaylist {
  id: string
  trackCount: number
}

interface ParsedCursor {
  offset: number
  startsNewSnapshot: boolean
}

export class NcmCliNeteaseDataAdapter implements NeteaseDataAdapter {
  private favoritePlaylist: Promise<FavoritePlaylist> | undefined

  constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly runCommand: NcmCliCommandRunner = runNcmCliCommand
  ) {}

  async getAvailability(): Promise<NeteaseAdapterAvailability> {
    if (this.platform !== 'win32') {
      return {
        available: false,
        reason: '网易云官方 CLI 导入目前仅支持 Windows'
      }
    }

    try {
      const result = await this.runCommand(['login', '--check'])
      if (!result.found) return { available: false, reason: CLI_NOT_FOUND_REASON }
      if (result.exitCode !== 0) return { available: false, reason: CLI_LOGIN_REASON }

      const response = parseJsonRecord(result.stdout)
      return response.success === true
        ? { available: true, reason: null }
        : { available: false, reason: CLI_LOGIN_REASON }
    } catch {
      return {
        available: false,
        reason: '无法检查网易云官方 CLI 登录状态，请稍后重试'
      }
    }
  }

  async fetchFavoritesPage(cursor: string | null): Promise<NeteaseFavoritesPage> {
    if (this.platform !== 'win32') {
      throw new NeteaseDataAdapterError('网易云官方 CLI 导入目前仅支持 Windows')
    }

    const parsedCursor = parseCursor(cursor)
    if (parsedCursor.startsNewSnapshot) this.favoritePlaylist = undefined
    const playlist = await this.getFavoritePlaylist()
    const response = await this.invokeJson([
      'playlist',
      'tracks',
      '--playlistId',
      playlist.id,
      '--limit',
      String(PAGE_SIZE),
      '--offset',
      String(parsedCursor.offset),
      '--output',
      'json'
    ])
    const data = successfulEnvelopeData(response, '歌曲列表')
    if (!Array.isArray(data) || data.length > PAGE_SIZE) {
      throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲列表格式无效')
    }

    const items = data.map(parseFavoriteTrack)
    const nextOffset = parsedCursor.offset + items.length
    const complete =
      items.length === 0 || items.length < PAGE_SIZE || nextOffset >= playlist.trackCount

    return {
      items,
      nextCursor: complete ? null : `${OFFSET_CURSOR_PREFIX}${nextOffset}`,
      checkpoint: complete ? COMPLETE_CHECKPOINT : null,
      unavailableProviderTrackIds: []
    }
  }

  private getFavoritePlaylist(): Promise<FavoritePlaylist> {
    this.favoritePlaylist ??= this.loadFavoritePlaylist().catch((error: unknown) => {
      this.favoritePlaylist = undefined
      throw error
    })
    return this.favoritePlaylist
  }

  private async loadFavoritePlaylist(): Promise<FavoritePlaylist> {
    const response = await this.invokeJson(['user', 'favorite', '--output', 'json'])
    const data = successfulEnvelopeData(response, '红心歌单')
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new NeteaseDataAdapterError('网易云官方 CLI 返回的红心歌单格式无效')
    }

    const record = data as Record<string, unknown>
    const id = record.id
    const trackCount = record.trackCount
    if (
      typeof id !== 'string' ||
      !/^[A-Za-z0-9._~+/=-]{1,200}$/u.test(id) ||
      typeof trackCount !== 'number' ||
      !Number.isSafeInteger(trackCount) ||
      trackCount < 0 ||
      trackCount > 1_000_000
    ) {
      throw new NeteaseDataAdapterError('网易云官方 CLI 返回的红心歌单格式无效')
    }

    return { id, trackCount }
  }

  private async invokeJson(arguments_: readonly string[]): Promise<Record<string, unknown>> {
    let result: NcmCliCommandResult
    try {
      result = await this.runCommand(arguments_)
    } catch {
      throw new NeteaseDataAdapterError('无法调用网易云官方 CLI，请稍后重试')
    }

    if (!result.found) throw new NeteaseDataAdapterError(CLI_NOT_FOUND_REASON)
    if (result.exitCode !== 0) {
      throw new NeteaseDataAdapterError('网易云官方 CLI 请求失败，请稍后重试')
    }

    try {
      return parseJsonRecord(result.stdout)
    } catch {
      throw new NeteaseDataAdapterError('网易云官方 CLI 返回了无效数据')
    }
  }
}

function parseCursor(cursor: string | null): ParsedCursor {
  if (cursor === null || cursor === COMPLETE_CHECKPOINT) {
    return { offset: 0, startsNewSnapshot: true }
  }
  if (!cursor.startsWith(OFFSET_CURSOR_PREFIX)) {
    throw new NeteaseDataAdapterError('网易云同步游标格式无效')
  }

  const offsetText = cursor.slice(OFFSET_CURSOR_PREFIX.length)
  if (!/^[1-9]\d{0,6}$/u.test(offsetText)) {
    throw new NeteaseDataAdapterError('网易云同步游标格式无效')
  }
  const offset = Number(offsetText)
  if (!Number.isSafeInteger(offset) || offset > 1_000_000) {
    throw new NeteaseDataAdapterError('网易云同步游标格式无效')
  }
  return { offset, startsNewSnapshot: false }
}

function parseJsonRecord(stdout: string): Record<string, unknown> {
  const parsed = JSON.parse(stdout.replace(/^\uFEFF/u, '').trim()) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回了无效数据')
  }
  return parsed as Record<string, unknown>
}

function successfulEnvelopeData(response: Record<string, unknown>, label: string): unknown {
  if (response.code !== 200) {
    throw new NeteaseDataAdapterError(`网易云官方 CLI ${label}请求失败`)
  }
  return response.data
}

function parseFavoriteTrack(value: unknown): NeteaseFavoriteTrack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲格式无效')
  }

  const record = value as Record<string, unknown>
  const providerTrackId = positiveIdentifier(record.originalId)
  const title = requiredText(record.name, 500)
  const artist = joinedArtistNames(record)
  const album = albumName(record.album)
  const durationMs = optionalDuration(record.duration)
  const favoritedAt = favoriteTimestamp(record.extMap)
  if (typeof record.visible !== 'boolean') {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲可见状态无效')
  }

  return {
    providerTrackId,
    title,
    artist,
    album,
    durationMs,
    url: `https://music.163.com/song?id=${providerTrackId}`,
    favoritedAt,
    available: record.visible
  }
}

function positiveIdentifier(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲 ID 无效')
    }
    return String(value)
  }
  if (typeof value === 'string' && /^[1-9]\d{0,19}$/u.test(value)) return value
  throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲 ID 无效')
}

function requiredText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲名称无效')
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲名称无效')
  }
  return normalized
}

function joinedArtistNames(record: Record<string, unknown>): string | null {
  for (const field of ['artists', 'fullArtists']) {
    const value = record[field]
    if (!Array.isArray(value)) continue

    const names = value
      .map((artist) => {
        if (!artist || typeof artist !== 'object' || Array.isArray(artist)) return null
        const name = (artist as Record<string, unknown>).name
        if (typeof name !== 'string') return null
        const normalized = name.trim()
        return normalized && normalized.length <= 500 ? normalized : null
      })
      .filter((name): name is string => name !== null)

    if (names.length > 0) return [...new Set(names)].join(' / ').slice(0, 500)
  }
  return null
}

function albumName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const name = (value as Record<string, unknown>).name
  if (typeof name !== 'string') return null
  const normalized = name.trim()
  return normalized && normalized.length <= 500 ? normalized : null
}

function optionalDuration(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的歌曲时长无效')
  }
  return value
}

function favoriteTimestamp(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const addTime = (value as Record<string, unknown>).addTime
  if (addTime === null || addTime === undefined || addTime === 0) return null

  let epochMilliseconds: number
  if (typeof addTime === 'number') {
    epochMilliseconds = addTime
  } else if (typeof addTime === 'string' && /^\d{1,16}$/u.test(addTime)) {
    epochMilliseconds = Number(addTime)
  } else {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的收藏时间无效')
  }

  if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds <= 0) {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的收藏时间无效')
  }
  const date = new Date(epochMilliseconds)
  if (Number.isNaN(date.getTime())) {
    throw new NeteaseDataAdapterError('网易云官方 CLI 返回的收藏时间无效')
  }
  return date.toISOString()
}
