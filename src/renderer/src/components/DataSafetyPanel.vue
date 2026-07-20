<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type {
  DataSafetyApi,
  DataSafetyFileResultDto,
  DataSafetyRestoreResultDto,
  DataSafetyStatusDto
} from '@shared/contracts'

const props = defineProps<{ api: DataSafetyApi }>()

const status = ref<DataSafetyStatusDto | null>(null)
const loading = ref(true)
const activeOperation = ref<'backup' | 'export' | 'restore' | null>(null)
const error = ref('')
const message = ref('')

onMounted(loadStatus)

async function loadStatus(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await props.api.getStatus()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    status.value = result.value
  } catch {
    error.value = '读取备份状态失败，请重试'
  } finally {
    loading.value = false
  }
}

async function createBackup(): Promise<void> {
  await runFileOperation('backup', props.api.createBackup, (result) =>
    result.fileName ? `数据库备份已保存：${result.fileName}` : '数据库备份已保存'
  )
}

async function exportJson(): Promise<void> {
  await runFileOperation('export', props.api.exportJson, (result) =>
    result.fileName ? `JSON 已导出：${result.fileName}` : 'JSON 已导出'
  )
}

async function restoreBackup(): Promise<void> {
  activeOperation.value = 'restore'
  error.value = ''
  message.value = ''
  try {
    const result = await props.api.restoreBackup()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    if (result.value.status === 'cancelled') return
    message.value = restoreMessage(result.value)
  } catch {
    error.value = '恢复备份失败，当前资料未被替换'
  } finally {
    activeOperation.value = null
  }
}

async function runFileOperation(
  operation: 'backup' | 'export',
  action: () => Promise<
    { ok: true; value: DataSafetyFileResultDto } | { ok: false; error: { message: string } }
  >,
  successMessage: (result: DataSafetyFileResultDto) => string
): Promise<void> {
  activeOperation.value = operation
  error.value = ''
  message.value = ''
  try {
    const result = await action()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    if (result.value.status === 'cancelled') return
    message.value = successMessage(result.value)
    await loadStatus()
  } catch {
    error.value =
      operation === 'backup'
        ? '创建备份失败，请检查保存位置后重试'
        : '导出 JSON 失败，请检查保存位置后重试'
  } finally {
    activeOperation.value = null
  }
}

function restoreMessage(result: DataSafetyRestoreResultDto): string {
  return result.restartRequired ? '备份已验证，应用即将重启并完成恢复。' : '备份已准备完成。'
}
</script>

<template>
  <section class="panel data-safety-panel">
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">DATA SAFETY</p>
        <h2>备份与导出</h2>
      </div>
      <span class="count-badge">M5</span>
    </div>

    <p v-if="loading" class="muted-copy">正在检查本地备份…</p>
    <p v-else-if="status" class="muted-copy">
      自动备份 {{ status.automaticBackupCount }} 份 · 数据库 v{{ status.schemaVersion }} · 导出 v{{
        status.exportFormatVersion
      }}
    </p>

    <div class="data-safety-actions">
      <button
        class="secondary-button full-width"
        data-action="backup"
        type="button"
        :disabled="activeOperation !== null"
        @click="createBackup"
      >
        {{ activeOperation === 'backup' ? '正在备份…' : '立即备份' }}
      </button>
      <button
        class="secondary-button full-width"
        data-action="export"
        type="button"
        :disabled="activeOperation !== null"
        @click="exportJson"
      >
        {{ activeOperation === 'export' ? '正在导出…' : '导出 JSON' }}
      </button>
      <button
        class="secondary-button full-width danger-outline"
        data-action="restore"
        type="button"
        :disabled="activeOperation !== null"
        @click="restoreBackup"
      >
        {{ activeOperation === 'restore' ? '正在验证…' : '从备份恢复' }}
      </button>
    </div>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="message" class="success-copy" role="status">{{ message }}</p>
  </section>
</template>
