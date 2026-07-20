import Database from 'better-sqlite3'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  CURRENT_SCHEMA_VERSION,
  openMusicDatabase,
  type SqliteDatabase
} from '../persistence/database'

const REQUIRED_TABLES = [
  'aliases',
  'memories',
  'memory_tracks',
  'notes',
  'provider_tracks',
  'schema_migrations',
  'sync_state',
  'tags',
  'track_tags',
  'tracks'
] as const

const AUTOMATIC_BACKUP_PATTERN = /^memory-music-auto-(\d{8}T\d{9}Z)\.sqlite3$/
const BACKUP_DIRECTORY_NAME = 'backups'
const RECOVERY_DIRECTORY_NAME = 'recovery'
const PENDING_RESTORE_NAME = 'restore-pending.sqlite3'

export const AUTOMATIC_BACKUP_LIMIT = 7

export type DatabaseValidationFailure = 'invalid' | 'newer' | 'outdated'

export class DatabaseValidationError extends Error {
  constructor(
    readonly failure: DatabaseValidationFailure,
    message: string
  ) {
    super(message)
    this.name = 'DatabaseValidationError'
  }
}

export interface DatabaseValidation {
  schemaVersion: number
}

export interface BackupFile {
  fileName: string
  path: string
  createdAt: string
}

export interface PendingRestoreApplication {
  applied: boolean
  rejected: boolean
}

export function dataSafetyPaths(userDataPath: string): {
  backupDirectory: string
  recoveryDirectory: string
  pendingRestorePath: string
} {
  const recoveryDirectory = join(userDataPath, RECOVERY_DIRECTORY_NAME)
  return {
    backupDirectory: join(userDataPath, BACKUP_DIRECTORY_NAME),
    recoveryDirectory,
    pendingRestorePath: join(recoveryDirectory, PENDING_RESTORE_NAME)
  }
}

export function validateMemoryMusicDatabase(
  databasePath: string,
  requireCurrentVersion = false
): DatabaseValidation {
  let database: Database.Database

  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true })
  } catch {
    throw new DatabaseValidationError('invalid', 'The selected file is not a readable database')
  }

  try {
    const integrity = database.pragma('integrity_check') as Array<Record<string, unknown>>
    if (
      integrity.length !== 1 ||
      String(integrity[0]?.integrity_check ?? integrity[0]?.['integrity_check(1)']) !== 'ok'
    ) {
      throw new DatabaseValidationError('invalid', 'Database integrity check failed')
    }

    const schemaVersion = Number(database.pragma('user_version', { simple: true }))
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new DatabaseValidationError('invalid', 'Database schema version is missing')
    }
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new DatabaseValidationError(
        'newer',
        `Database schema ${schemaVersion} is newer than ${CURRENT_SCHEMA_VERSION}`
      )
    }
    if (requireCurrentVersion && schemaVersion !== CURRENT_SCHEMA_VERSION) {
      throw new DatabaseValidationError(
        'outdated',
        `Database schema ${schemaVersion} is not the current version`
      )
    }

    const tables = new Set(
      (
        database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string
        }>
      ).map((row) => row.name)
    )
    if (REQUIRED_TABLES.some((table) => !tables.has(table))) {
      throw new DatabaseValidationError('invalid', 'Required MemoryMusic tables are missing')
    }

    const versions = (
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
        version: number
      }>
    ).map((row) => Number(row.version))
    const contiguous = versions.every((version, index) => version === index + 1)
    if (!contiguous || versions.at(-1) !== schemaVersion) {
      throw new DatabaseValidationError('invalid', 'Database migration metadata is inconsistent')
    }

    const foreignKeyFailures = database.pragma('foreign_key_check') as unknown[]
    if (foreignKeyFailures.length > 0) {
      throw new DatabaseValidationError('invalid', 'Database relationships are inconsistent')
    }

    return { schemaVersion }
  } catch (error) {
    if (error instanceof DatabaseValidationError) throw error
    throw new DatabaseValidationError('invalid', 'The selected database could not be validated')
  } finally {
    database.close()
  }
}

export async function createDatabaseBackup(
  database: SqliteDatabase,
  destinationPath: string,
  requireCurrentVersion = true
): Promise<void> {
  const preparedPath = temporarySibling(destinationPath, 'backup')
  mkdirSync(dirname(destinationPath), { recursive: true })

  try {
    await database.backup(preparedPath)
    validateMemoryMusicDatabase(preparedPath, requireCurrentVersion)
    replacePreparedFile(preparedPath, destinationPath)
  } finally {
    removeDatabaseFiles(preparedPath)
  }
}

export async function createStartupBackupIfNeeded(
  databasePath: string,
  userDataPath: string,
  date: Date
): Promise<void> {
  if (!existsSync(databasePath)) return

  const backups = listAutomaticBackups(userDataPath)
  if (backups.some((backup) => sameUtcDay(backup.createdAt, date))) return

  const database = new Database(databasePath, { fileMustExist: true })
  try {
    database.pragma('busy_timeout = 5000')
    await createDatabaseBackup(database, automaticBackupPath(userDataPath, date), false)
    rotateAutomaticBackups(userDataPath)
  } finally {
    database.close()
  }
}

export async function prepareRestore(
  sourcePath: string,
  pendingRestorePath: string
): Promise<void> {
  validateMemoryMusicDatabase(sourcePath)
  mkdirSync(dirname(pendingRestorePath), { recursive: true })

  const migrationPath = temporarySibling(pendingRestorePath, 'migration')
  const preparedPath = temporarySibling(pendingRestorePath, 'prepared')
  let source: Database.Database | undefined
  let migrated: SqliteDatabase | undefined

  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true })
    await source.backup(migrationPath)
    source.close()
    source = undefined

    migrated = openMusicDatabase(migrationPath)
    await migrated.backup(preparedPath)
    migrated.close()
    migrated = undefined

    validateMemoryMusicDatabase(preparedPath, true)
    removeDatabaseSidecars(pendingRestorePath)
    replacePreparedFile(preparedPath, pendingRestorePath)
  } finally {
    if (source?.open) source.close()
    if (migrated?.open) migrated.close()
    removeDatabaseFiles(migrationPath)
    removeDatabaseFiles(preparedPath)
  }
}

export function applyPendingRestore(
  databasePath: string,
  userDataPath: string
): PendingRestoreApplication {
  const { pendingRestorePath, recoveryDirectory } = dataSafetyPaths(userDataPath)
  if (!existsSync(pendingRestorePath)) return { applied: false, rejected: false }

  try {
    validateMemoryMusicDatabase(pendingRestorePath, true)
  } catch {
    mkdirSync(recoveryDirectory, { recursive: true })
    const rejectedPath = join(
      recoveryDirectory,
      `restore-rejected-${formatFileTimestamp(new Date())}.sqlite3`
    )
    replacePreparedFile(pendingRestorePath, rejectedPath)
    removeDatabaseSidecars(pendingRestorePath)
    return { applied: false, rejected: true }
  }

  mkdirSync(dirname(databasePath), { recursive: true })
  const rollbackToken = randomUUID()
  const liveFiles = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]
  const displaced = liveFiles
    .filter((path) => existsSync(path))
    .map((path) => ({ original: path, rollback: `${path}.restore-${rollbackToken}` }))

  try {
    for (const file of displaced) renameSync(file.original, file.rollback)
    renameSync(pendingRestorePath, databasePath)
  } catch (error) {
    if (existsSync(databasePath) && !displaced.some((file) => file.original === databasePath)) {
      rmSync(databasePath, { force: true })
    }
    for (const file of displaced.reverse()) {
      if (existsSync(file.rollback) && !existsSync(file.original)) {
        renameSync(file.rollback, file.original)
      }
    }
    throw error
  }

  for (const file of displaced) rmSync(file.rollback, { force: true })
  removeDatabaseSidecars(pendingRestorePath)
  return { applied: true, rejected: false }
}

export function listAutomaticBackups(userDataPath: string): BackupFile[] {
  const { backupDirectory } = dataSafetyPaths(userDataPath)
  if (!existsSync(backupDirectory)) return []

  return readdirSync(backupDirectory)
    .filter((fileName) => AUTOMATIC_BACKUP_PATTERN.test(fileName))
    .map((fileName) => {
      const path = join(backupDirectory, fileName)
      return { fileName, path, createdAt: statSync(path).mtime.toISOString() }
    })
    .sort((left, right) => right.fileName.localeCompare(left.fileName))
}

export function rotateAutomaticBackups(userDataPath: string, limit = AUTOMATIC_BACKUP_LIMIT): void {
  for (const backup of listAutomaticBackups(userDataPath).slice(limit)) {
    rmSync(backup.path, { force: true })
  }
}

export function automaticBackupPath(userDataPath: string, date: Date): string {
  const { backupDirectory } = dataSafetyPaths(userDataPath)
  return join(backupDirectory, `memory-music-auto-${formatFileTimestamp(date)}.sqlite3`)
}

export function preRestoreBackupPath(userDataPath: string, date: Date): string {
  const { backupDirectory } = dataSafetyPaths(userDataPath)
  const base = join(backupDirectory, `memory-music-pre-restore-${formatFileTimestamp(date)}`)
  return availablePath(`${base}.sqlite3`)
}

export function sameUtcDay(isoTimestamp: string, date: Date): boolean {
  return isoTimestamp.slice(0, 10) === date.toISOString().slice(0, 10)
}

export function ensureExtension(path: string, extension: '.sqlite3' | '.json'): string {
  return extname(path).toLocaleLowerCase() === extension ? path : `${path}${extension}`
}

export function assertSafeDestination(destinationPath: string, databasePath: string): void {
  if (samePath(destinationPath, databasePath)) {
    throw new Error('The active database cannot be used as an output destination')
  }
}

export function writeTextFileAtomically(destinationPath: string, contents: string): void {
  const preparedPath = temporarySibling(destinationPath, 'export')
  mkdirSync(dirname(destinationPath), { recursive: true })

  try {
    writeFileSync(preparedPath, contents, { encoding: 'utf8', flag: 'wx' })
    replacePreparedFile(preparedPath, destinationPath)
  } finally {
    rmSync(preparedPath, { force: true })
  }
}

export function formatFileTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '')
}

export function displayFileName(path: string): string {
  return basename(path)
}

function availablePath(requestedPath: string): string {
  if (!existsSync(requestedPath)) return requestedPath

  const extension = extname(requestedPath)
  const base = requestedPath.slice(0, -extension.length)
  let suffix = 2
  while (existsSync(`${base}-${suffix}${extension}`)) suffix += 1
  return `${base}-${suffix}${extension}`
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLocaleLowerCase() === normalizedRight.toLocaleLowerCase()
    : normalizedLeft === normalizedRight
}

function temporarySibling(destinationPath: string, label: string): string {
  return join(dirname(destinationPath), `.${basename(destinationPath)}.${label}-${randomUUID()}`)
}

function replacePreparedFile(preparedPath: string, destinationPath: string): void {
  mkdirSync(dirname(destinationPath), { recursive: true })
  const displacedPath = `${destinationPath}.previous-${randomUUID()}`
  const hadDestination = existsSync(destinationPath)
  let installed = false

  try {
    if (hadDestination) renameSync(destinationPath, displacedPath)
    renameSync(preparedPath, destinationPath)
    installed = true
  } finally {
    if (!installed && hadDestination && existsSync(displacedPath) && !existsSync(destinationPath)) {
      renameSync(displacedPath, destinationPath)
    }
    if (installed && hadDestination) rmSync(displacedPath, { force: true })
  }
}

function removeDatabaseFiles(path: string): void {
  rmSync(path, { force: true })
  removeDatabaseSidecars(path)
}

function removeDatabaseSidecars(path: string): void {
  rmSync(`${path}-wal`, { force: true })
  rmSync(`${path}-shm`, { force: true })
}
