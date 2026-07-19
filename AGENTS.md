# MemoryMusic Agent Notes

## Setup

- Use Node.js 22.13 or newer and pnpm 10 or newer.
- Install the committed dependency graph with `pnpm install --frozen-lockfile`.
- When dependencies intentionally change, run `pnpm install` once and commit the updated lockfile.
- Native build scripts are allowlisted in `pnpm-workspace.yaml`. Keep the list limited to packages present in the dependency graph.
- `better-sqlite3` is rebuilt for Electron during `postinstall`. The test wrapper runs Vitest with Electron's embedded Node runtime so both use the same native ABI.

## Verification

Run these before handing off code changes:

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Database changes must also prove that a new file can migrate to the latest version, migrations can run repeatedly, records survive a close/reopen cycle, and deleting a provider mapping preserves personal data.

Core renderer interactions must cover both confirmed success and failure behavior. A failed save must remain visibly failed and must not clear user-entered form data.

## Architecture constraints

- SQLite persistence belongs in the Electron main process only.
- Keep the renderer sandboxed: no Node integration and no direct database access.
- Keep renderer/main contracts and IPC channel names in `src/shared/contracts.ts`; expose only the typed `window.memoryMusic` API from preload.
- Treat every IPC payload as untrusted. Validate and normalize it in the main-process service before starting Repository writes, and return the stable `ApiResult` envelope instead of leaking SQLite errors.
- Add schema changes as ordered migrations and include an upgrade test that proves existing personal records survive.
- Search tables are derived data. Rebuilding FTS/search documents must never update source tracks, tags, notes, memories, aliases, or their relationships.
- Keep search normalization and ranking deterministic. New transliteration, fuzzy, or semantic expansion requires a documented need, field-level explanations, and regression cases in the forgetful-query baseline.
- Personal tags, notes, memories, and aliases must not be deleted when a provider track becomes unavailable or its mapping is removed.
- Cloud work may implement and test platform-neutral logic. NetEase desktop integration, `orpheus://`, SMTC, Credential Manager, and Windows installers require local Windows verification.
- Do not add NetEase private APIs, credential handling, or playback integration before its planned milestone.
