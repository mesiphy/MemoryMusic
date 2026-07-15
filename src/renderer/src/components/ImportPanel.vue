<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ImportApi, NeteaseImportStatusDto } from '@shared/contracts'

const props = defineProps<{ api: ImportApi }>()
const emit = defineEmits<{ imported: [] }>()

const status = ref<NeteaseImportStatusDto | null>(null)
const loading = ref(true)
const syncing = ref(false)
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
    error.value = '读取导入状态失败，请重试'
  } finally {
    loading.value = false
  }
}

async function sync(): Promise<void> {
  syncing.value = true
  error.value = ''
  message.value = ''
  try {
    const result = await props.api.syncFavorites()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    message.value = `已处理 ${result.value.processedCount} 首；新增 ${result.value.importedCount} 首，复用 ${result.value.reusedTrackCount} 首。`
    emit('imported')
    await loadStatus()
  } catch {
    error.value = '同步收藏失败，请重试'
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <section class="panel import-panel">
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">NETEASE IMPORT</p>
        <h2>收藏导入</h2>
      </div>
      <span class="count-badge">M4</span>
    </div>

    <p v-if="loading" class="muted-copy">正在检查官方导入能力…</p>
    <template v-else-if="status">
      <p v-if="!status.available" class="muted-copy">{{ status.unavailableReason }}</p>
      <p v-else class="muted-copy">
        {{
          status.sync.lastSuccessAt
            ? `上次成功：${new Date(status.sync.lastSuccessAt).toLocaleString('zh-CN')}`
            : '尚未同步'
        }}
      </p>
      <button
        class="secondary-button full-width"
        type="button"
        :disabled="syncing || !status.available"
        @click="sync"
      >
        {{ syncing ? '正在同步…' : '同步“我喜欢的音乐”' }}
      </button>
    </template>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="message" class="success-copy" role="status">{{ message }}</p>
  </section>
</template>
