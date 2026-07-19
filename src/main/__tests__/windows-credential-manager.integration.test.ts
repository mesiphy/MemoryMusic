import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { NeteaseCredentialStore } from '../security/windows-credential-manager'

const runRealCredentialTest =
  process.platform === 'win32' && process.env.MEMORY_MUSIC_WINDOWS_CREDENTIAL_TEST === '1'

describe.skipIf(!runRealCredentialTest)('Windows Credential Manager integration', () => {
  it('writes, reads, and deletes an isolated fake credential', async () => {
    const target = `MemoryMusic/Test/${randomUUID()}`
    const store = new NeteaseCredentialStore(undefined, target)
    const fake = {
      appId: `fake-app-${randomUUID()}`,
      privateKey: `fake-private-key-${randomUUID()}`
    }

    try {
      await store.save(fake)
      await expect(store.load()).resolves.toEqual(fake)
    } finally {
      await store.clear()
    }

    await expect(store.load()).resolves.toBeNull()
  }, 30000)
})
