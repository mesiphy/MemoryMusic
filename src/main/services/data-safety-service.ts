import type {
  ApiErrorCode,
  ApiResult,
  DataSafetyFileResultDto,
  DataSafetyRestoreResultDto,
  DataSafetyStatusDto
} from '../../shared/contracts'
import {
  assertSafeDestination,
  automaticBackupPath,
  createDatabaseBackup,
  dataSafetyPaths,
  DatabaseValidationError,
  displayFileName,
  ensureExtension,
  formatFileTimestamp,
  listAutomaticBackups,
  prepareRestore,
  preRestoreBackupPath,
  rotateAutomaticBackups,
  sameUtcDay,
  validateMemoryMusicDatabase,
  writeTextFileAtomically
} from '../data-safety/database-files'
import { createJsonExport, JSON_EXPORT_FORMAT_VERSION } from '../data-safety/json-export'
import type { SqliteDatabase } from '../persistence/database'

export interface DataSafetyDialogAdapter {
  chooseBackupDestination(defaultFileName: string): Promise<string | null>
  chooseExportDestination(defaultFileName: string): Promise<string | null>
  chooseRestoreSource(): Promise<string | null>
  confirmRestore(fileName: string): Promise<boolean>
}

class DataSafetyRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DataSafetyRequestError'
  }
}

export class DataSafetyService {
  private operationInProgress = false

  constructor(
    private readonly database: SqliteDatabase,
    private readonly databasePath: string,
    private readonly userDataPath: string,
    private readonly dialogs: DataSafetyDialogAdapter,
    private readonly now: () => Date = () => new Date()
  ) {}

  getStatus(): ApiResult<DataSafetyStatusDto> {
    try {
      const backups = listAutomaticBackups(this.userDataPath)
      return {
        ok: true,
        value: {
          schemaVersion: Number(this.database.pragma('user_version', { simple: true })),
          exportFormatVersion: JSON_EXPORT_FORMAT_VERSION,
          automaticBackupCount: backups.length,
          lastAutomaticBackupAt: backups[0]?.createdAt ?? null,
          restorePending: this.hasPendingRestore()
        }
      }
    } catch {
      return {
        ok: false,
        error: { code: 'STORAGE', message: '无法读取数据安全状态，请检查存储空间后重试' }
      }
    }
  }

  async createBackup(): Promise<ApiResult<DataSafetyFileResultDto>> {
    return this.runExclusive('创建备份失败，请检查保存位置和磁盘空间后重试', async () => {
      const date = this.now()
      const selected = await this.dialogs.chooseBackupDestination(
        `MemoryMusic-backup-${formatFileTimestamp(date)}.sqlite3`
      )
      if (!selected) return cancelledFileResult()

      const destination = ensureExtension(selected, '.sqlite3')
      this.assertDestination(destination)
      await createDatabaseBackup(this.database, destination)
      return completedFileResult(destination, date)
    })
  }

  async exportJson(): Promise<ApiResult<DataSafetyFileResultDto>> {
    return this.runExclusive('导出 JSON 失败，请检查保存位置和磁盘空间后重试', async () => {
      const date = this.now()
      const selected = await this.dialogs.chooseExportDestination(
        `MemoryMusic-export-${formatFileTimestamp(date)}.json`
      )
      if (!selected) return cancelledFileResult()

      const destination = ensureExtension(selected, '.json')
      this.assertDestination(destination)
      writeTextFileAtomically(destination, createJsonExport(this.database, date))
      return completedFileResult(destination, date)
    })
  }

  async restoreBackup(): Promise<ApiResult<DataSafetyRestoreResultDto>> {
    return this.runExclusive('恢复备份失败，当前资料未被替换', async () => {
      const selected = await this.dialogs.chooseRestoreSource()
      if (!selected) return cancelledRestoreResult()
      if (this.sameAsActiveDatabase(selected)) {
        throw new DataSafetyRequestError('VALIDATION', '不能选择当前正在使用的数据库')
      }

      try {
        validateMemoryMusicDatabase(selected)
      } catch (error) {
        throw restoreValidationError(error)
      }

      const confirmed = await this.dialogs.confirmRestore(displayFileName(selected))
      if (!confirmed) return cancelledRestoreResult()

      const date = this.now()
      await createDatabaseBackup(this.database, preRestoreBackupPath(this.userDataPath, date))
      const { pendingRestorePath } = dataSafetyPaths(this.userDataPath)
      try {
        await prepareRestore(selected, pendingRestorePath)
      } catch (error) {
        if (error instanceof DatabaseValidationError) throw restoreValidationError(error)
        throw error
      }

      return {
        ...completedFileResult(selected, date),
        restartRequired: true
      }
    })
  }

  async createAutomaticBackupIfNeeded(): Promise<void> {
    const date = this.now()
    const backups = listAutomaticBackups(this.userDataPath)
    if (backups.some((backup) => sameUtcDay(backup.createdAt, date))) return

    await createDatabaseBackup(this.database, automaticBackupPath(this.userDataPath, date))
    rotateAutomaticBackups(this.userDataPath)
  }

  private hasPendingRestore(): boolean {
    const { pendingRestorePath } = dataSafetyPaths(this.userDataPath)
    try {
      validateMemoryMusicDatabase(pendingRestorePath, true)
      return true
    } catch {
      return false
    }
  }

  private assertDestination(destination: string): void {
    try {
      assertSafeDestination(destination, this.databasePath)
    } catch {
      throw new DataSafetyRequestError('VALIDATION', '不能覆盖当前正在使用的数据库')
    }
  }

  private sameAsActiveDatabase(path: string): boolean {
    try {
      assertSafeDestination(path, this.databasePath)
      return false
    } catch {
      return true
    }
  }

  private async runExclusive<T>(
    fallbackMessage: string,
    operation: () => Promise<T>
  ): Promise<ApiResult<T>> {
    if (this.operationInProgress) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: '另一项数据安全操作正在进行，请稍后重试' }
      }
    }

    this.operationInProgress = true
    try {
      return { ok: true, value: await operation() }
    } catch (error) {
      if (error instanceof DataSafetyRequestError) {
        return { ok: false, error: { code: error.code, message: error.message } }
      }
      console.error(fallbackMessage)
      return { ok: false, error: { code: 'STORAGE', message: fallbackMessage } }
    } finally {
      this.operationInProgress = false
    }
  }
}

function restoreValidationError(error: unknown): DataSafetyRequestError {
  if (error instanceof DatabaseValidationError && error.failure === 'newer') {
    return new DataSafetyRequestError(
      'UNSUPPORTED',
      '该备份由更新版本的 MemoryMusic 创建，请先升级应用'
    )
  }
  return new DataSafetyRequestError('VALIDATION', '所选文件不是有效的 MemoryMusic 备份')
}

function completedFileResult(path: string, date: Date): DataSafetyFileResultDto {
  return {
    status: 'completed',
    fileName: displayFileName(path),
    completedAt: date.toISOString()
  }
}

function cancelledFileResult(): DataSafetyFileResultDto {
  return { status: 'cancelled', fileName: null, completedAt: null }
}

function cancelledRestoreResult(): DataSafetyRestoreResultDto {
  return { ...cancelledFileResult(), restartRequired: false }
}
