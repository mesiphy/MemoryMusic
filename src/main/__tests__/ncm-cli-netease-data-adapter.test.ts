import { describe, expect, it } from 'vitest'
import { NcmCliNeteaseDataAdapter } from '../import/ncm-cli-netease-data-adapter'
import type { NcmCliCommandResult, NcmCliCommandRunner } from '../import/ncm-cli-runner'

const favoriteCommand = ['user', 'favorite', '--output', 'json']
const loginCheckCommand = ['login', '--check']

function successfulResult(value: unknown): NcmCliCommandResult {
  return { found: true, exitCode: 0, stdout: JSON.stringify(value) }
}

function favoriteResponse(trackCount: number): NcmCliCommandResult {
  return successfulResult({
    code: 200,
    subCode: null,
    message: null,
    data: {
      id: 'EncryptedFavorite123',
      trackCount
    }
  })
}

function track(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    originalId: 100_000 + index,
    name: `Song ${index}`,
    artists: [{ name: `Artist ${index}` }],
    fullArtists: [{ name: `Artist ${index}` }],
    album: { name: `Album ${index}` },
    duration: 180_000 + index,
    visible: true,
    jumpUrl: `orpheus://song/${100_000 + index}`,
    extMap: { addTime: Date.UTC(2026, 0, 1, 0, 0, index) },
    ...overrides
  }
}

describe('NcmCliNeteaseDataAdapter', () => {
  it('reports availability only after the official login check succeeds', async () => {
    const calls: string[][] = []
    const runner: NcmCliCommandRunner = async (arguments_) => {
      calls.push([...arguments_])
      return successfulResult({ success: true, message: '已登录' })
    }

    await expect(new NcmCliNeteaseDataAdapter('win32', runner).getAvailability()).resolves.toEqual({
      available: true,
      reason: null
    })
    expect(calls).toEqual([loginCheckCommand])
  })

  it('returns stable unavailable reasons without exposing CLI output', async () => {
    const missingRunner: NcmCliCommandRunner = async () => ({
      found: false,
      exitCode: null,
      stdout: ''
    })
    const loggedOutRunner: NcmCliCommandRunner = async () =>
      successfulResult({ success: false, message: 'token=do-not-expose' })
    const malformedRunner: NcmCliCommandRunner = async () => ({
      found: true,
      exitCode: 0,
      stdout: 'privateKey=do-not-expose'
    })

    const missing = await new NcmCliNeteaseDataAdapter('win32', missingRunner).getAvailability()
    const loggedOut = await new NcmCliNeteaseDataAdapter('win32', loggedOutRunner).getAvailability()
    const malformed = await new NcmCliNeteaseDataAdapter('win32', malformedRunner).getAvailability()

    expect(missing).toMatchObject({ available: false })
    expect(loggedOut).toMatchObject({ available: false })
    expect(malformed).toMatchObject({ available: false })
    expect(JSON.stringify([missing, loggedOut, malformed])).not.toContain('do-not-expose')
  })

  it('does not invoke the Windows runner on unsupported platforms', async () => {
    let called = false
    const runner: NcmCliCommandRunner = async () => {
      called = true
      return successfulResult({ success: true })
    }

    await expect(new NcmCliNeteaseDataAdapter('linux', runner).getAvailability()).resolves.toEqual({
      available: false,
      reason: '网易云官方 CLI 导入目前仅支持 Windows'
    })
    expect(called).toBe(false)
  })

  it('maps official fields, paginates by offset, and restarts after a complete checkpoint', async () => {
    const calls: string[][] = []
    const firstPage = Array.from({ length: 100 }, (_, index) => track(index + 1))
    firstPage[0] = track(1, {
      name: '  First song  ',
      artists: [{ name: ' Artist A ' }, { name: 'Artist B' }, { name: 'Artist A' }],
      album: { name: ' First album ' },
      visible: false,
      extMap: { addTime: 1_767_225_600_000 }
    })
    const secondPage = Array.from({ length: 50 }, (_, index) => track(index + 101))
    let favoriteRequests = 0

    const runner: NcmCliCommandRunner = async (arguments_) => {
      const command = [...arguments_]
      calls.push(command)
      if (command[0] === 'user') {
        favoriteRequests += 1
        return favoriteResponse(150)
      }
      const offset = Number(command[7])
      return successfulResult({
        code: 200,
        subCode: '200',
        message: null,
        data: offset === 0 ? firstPage : secondPage
      })
    }
    const adapter = new NcmCliNeteaseDataAdapter('win32', runner)

    const first = await adapter.fetchFavoritesPage(null)
    const second = await adapter.fetchFavoritesPage(first.nextCursor)
    const repeated = await adapter.fetchFavoritesPage(second.checkpoint)

    expect(first).toMatchObject({
      nextCursor: 'ncm-cli:v1:offset:100',
      checkpoint: null,
      unavailableProviderTrackIds: []
    })
    expect(first.items).toHaveLength(100)
    expect(first.items[0]).toEqual({
      providerTrackId: '100001',
      title: 'First song',
      artist: 'Artist A / Artist B',
      album: 'First album',
      durationMs: 180001,
      url: 'https://music.163.com/song?id=100001',
      favoritedAt: '2026-01-01T00:00:00.000Z',
      available: false
    })
    expect(second).toMatchObject({
      nextCursor: null,
      checkpoint: 'ncm-cli:v1:complete'
    })
    expect(second.items).toHaveLength(50)
    expect(repeated.nextCursor).toBe('ncm-cli:v1:offset:100')
    expect(favoriteRequests).toBe(2)
    expect(calls).toEqual([
      favoriteCommand,
      [
        'playlist',
        'tracks',
        '--playlistId',
        'EncryptedFavorite123',
        '--limit',
        '100',
        '--offset',
        '0',
        '--output',
        'json'
      ],
      [
        'playlist',
        'tracks',
        '--playlistId',
        'EncryptedFavorite123',
        '--limit',
        '100',
        '--offset',
        '100',
        '--output',
        'json'
      ],
      favoriteCommand,
      [
        'playlist',
        'tracks',
        '--playlistId',
        'EncryptedFavorite123',
        '--limit',
        '100',
        '--offset',
        '0',
        '--output',
        'json'
      ]
    ])
  })

  it('rejects invalid cursors before invoking the CLI', async () => {
    let called = false
    const runner: NcmCliCommandRunner = async () => {
      called = true
      return favoriteResponse(0)
    }

    await expect(
      new NcmCliNeteaseDataAdapter('win32', runner).fetchFavoritesPage('offset;Remove-Item')
    ).rejects.toThrow('网易云同步游标格式无效')
    expect(called).toBe(false)
  })

  it('can retry playlist discovery after a transient runner failure', async () => {
    let favoriteAttempts = 0
    const runner: NcmCliCommandRunner = async (arguments_) => {
      if (arguments_[0] === 'user') {
        favoriteAttempts += 1
        if (favoriteAttempts === 1) throw new Error('transient private output')
        return favoriteResponse(101)
      }
      return successfulResult({ code: 200, data: [track(101)] })
    }
    const adapter = new NcmCliNeteaseDataAdapter('win32', runner)

    await expect(adapter.fetchFavoritesPage('ncm-cli:v1:offset:100')).rejects.toThrow(
      '无法调用网易云官方 CLI，请稍后重试'
    )
    await expect(adapter.fetchFavoritesPage('ncm-cli:v1:offset:100')).resolves.toMatchObject({
      nextCursor: null,
      checkpoint: 'ncm-cli:v1:complete',
      items: [{ providerTrackId: '100101' }]
    })
    expect(favoriteAttempts).toBe(2)
  })

  it('turns failed or malformed CLI responses into stable adapter errors', async () => {
    const failedRunner: NcmCliCommandRunner = async () => ({
      found: true,
      exitCode: 1,
      stdout: '{"privateKey":"do-not-expose"}'
    })
    const malformedTrackRunner: NcmCliCommandRunner = async (arguments_) =>
      arguments_[0] === 'user'
        ? favoriteResponse(1)
        : successfulResult({
            code: 200,
            data: [track(1, { originalId: 'not-an-id' })]
          })

    const failed = new NcmCliNeteaseDataAdapter('win32', failedRunner).fetchFavoritesPage(null)
    const malformed = new NcmCliNeteaseDataAdapter(
      'win32',
      malformedTrackRunner
    ).fetchFavoritesPage(null)

    await expect(failed).rejects.toThrow('网易云官方 CLI 请求失败，请稍后重试')
    await expect(failed).rejects.not.toThrow('do-not-expose')
    await expect(malformed).rejects.toThrow('网易云官方 CLI 返回的歌曲 ID 无效')
  })
})
