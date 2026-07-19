import { describe, expect, it } from 'vitest'
import {
  CredentialStoreError,
  NeteaseCredentialStore,
  type CredentialManagerBackend,
  type CredentialManagerRequest,
  type CredentialManagerResponse
} from '../security/windows-credential-manager'

class MemoryCredentialBackend implements CredentialManagerBackend {
  readonly requests: CredentialManagerRequest[] = []
  private readonly values = new Map<string, string>()

  async execute(request: CredentialManagerRequest): Promise<CredentialManagerResponse> {
    this.requests.push(request)
    if (request.operation === 'write') {
      this.values.set(request.target, request.secret)
      return { ok: true }
    }
    if (request.operation === 'delete') {
      this.values.delete(request.target)
      return { ok: true }
    }
    const secret = this.values.get(request.target)
    return secret === undefined ? { ok: true, found: false } : { ok: true, found: true, secret }
  }
}

describe('NeteaseCredentialStore', () => {
  it('stores both official credential parts in one opaque Credential Manager payload', async () => {
    const backend = new MemoryCredentialBackend()
    const store = new NeteaseCredentialStore(backend, 'MemoryMusic/Test/Credential')
    const credentials = { appId: 'test-app-id', privateKey: 'test-private-key' }

    await store.save(credentials)

    await expect(store.load()).resolves.toEqual(credentials)
    expect(backend.requests[0]).toMatchObject({
      operation: 'write',
      target: 'MemoryMusic/Test/Credential'
    })
    expect(backend.requests[0]).not.toHaveProperty('appId')
    expect(backend.requests[0]).not.toHaveProperty('privateKey')

    await store.clear()
    await expect(store.load()).resolves.toBeNull()
  })

  it('rejects missing values and malformed stored payloads with stable messages', async () => {
    const backend: CredentialManagerBackend = {
      execute: async (request) =>
        request.operation === 'read'
          ? { ok: true, found: true, secret: '{"version":2}' }
          : { ok: true }
    }
    const store = new NeteaseCredentialStore(backend)

    await expect(store.save({ appId: '', privateKey: 'key' })).rejects.toBeInstanceOf(
      CredentialStoreError
    )
    await expect(store.load()).rejects.toThrow('凭据格式无效')
  })
})
