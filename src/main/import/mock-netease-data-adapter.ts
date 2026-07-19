import {
  NeteaseDataAdapterError,
  type NeteaseAdapterAvailability,
  type NeteaseDataAdapter,
  type NeteaseFavoritesPage
} from './netease-data-adapter'

const START_CURSOR = '<start>'

export type MockNeteasePage = NeteaseFavoritesPage | Error

export class MockNeteaseDataAdapter implements NeteaseDataAdapter {
  readonly requestedCursors: Array<string | null> = []

  constructor(
    private readonly pages: ReadonlyMap<string, MockNeteasePage>,
    private readonly availability: NeteaseAdapterAvailability = {
      available: true,
      reason: null
    }
  ) {}

  async getAvailability(): Promise<NeteaseAdapterAvailability> {
    return this.availability
  }

  async fetchFavoritesPage(cursor: string | null): Promise<NeteaseFavoritesPage> {
    this.requestedCursors.push(cursor)
    const page = this.pages.get(cursor ?? START_CURSOR)
    if (!page) throw new NeteaseDataAdapterError('Mock 未配置当前同步游标')
    if (page instanceof Error) throw page
    return page
  }

  static startCursorKey(): string {
    return START_CURSOR
  }
}
