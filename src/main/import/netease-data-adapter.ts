export interface NeteaseAdapterAvailability {
  available: boolean
  reason: string | null
}

export interface NeteaseFavoriteTrack {
  providerTrackId: string
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  url: string | null
  favoritedAt: string | null
  available: boolean
}

export interface NeteaseFavoritesPage {
  items: NeteaseFavoriteTrack[]
  nextCursor: string | null
  checkpoint: string | null
  unavailableProviderTrackIds: string[]
}

export interface NeteaseDataAdapter {
  getAvailability(): Promise<NeteaseAdapterAvailability>
  fetchFavoritesPage(cursor: string | null): Promise<NeteaseFavoritesPage>
}

export class NeteaseDataAdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NeteaseDataAdapterError'
  }
}

export class UnavailableNeteaseDataAdapter implements NeteaseDataAdapter {
  constructor(private readonly reason: string) {}

  async getAvailability(): Promise<NeteaseAdapterAvailability> {
    return { available: false, reason: this.reason }
  }

  async fetchFavoritesPage(): Promise<NeteaseFavoritesPage> {
    throw new NeteaseDataAdapterError(this.reason)
  }
}
