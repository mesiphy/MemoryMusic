import { describe, expect, it } from 'vitest'
import { runWindowsSmtcCommand } from '../playback/windows-smtc-adapter'

const enabled =
  process.platform === 'win32' && process.env.MEMORY_MUSIC_WINDOWS_SMTC_INTEGRATION === '1'

describe.skipIf(!enabled)('Windows SMTC integration', () => {
  it('reads the real NetEase media session', async () => {
    const result = await runWindowsSmtcCommand('status')

    expect(result.nowPlaying).toMatchObject({
      sourceAppId: 'cloudmusic.exe',
      title: expect.any(String),
      artist: expect.any(String)
    })
    expect(result.nowPlaying?.title).not.toBe('')
    expect(result.nowPlaying?.title).not.toContain('\uFFFD')
    expect(result.nowPlaying?.artist).not.toContain('\uFFFD')
  })

  it('sends an idempotent pause command to the real session', async () => {
    const result = await runWindowsSmtcCommand('pause')

    expect(result.accepted).toBe(true)
    expect(result.nowPlaying?.status).toBe('paused')
  })
})
