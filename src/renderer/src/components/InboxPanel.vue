<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { CaptureApi, QuickCaptureInboxItemDto } from '@shared/contracts'

const props = defineProps<{ api: CaptureApi }>()
const emit = defineEmits<{ select: [trackId: number] }>()

const items = ref<QuickCaptureInboxItemDto[]>([])
const loading = ref(true)
const resolvingId = ref<number | null>(null)
const error = ref('')

onMounted(() => {
  void load()
  window.addEventListener('focus', load)
})
onBeforeUnmount(() => window.removeEventListener('focus', load))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await props.api.listInbox()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    items.value = result.value
  } catch {
    error.value = '读取待整理箱失败，请重试'
  } finally {
    loading.value = false
  }
}

async function resolve(id: number): Promise<void> {
  resolvingId.value = id
  error.value = ''
  try {
    const result = await props.api.resolveInbox({ inboxItemId: id })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    items.value = items.value.filter((item) => item.id !== id)
  } catch {
    error.value = '更新待整理箱失败，请重试'
  } finally {
    resolvingId.value = null
  }
}
</script>

<template>
  <section class="panel inbox-panel">
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">CAPTURE INBOX</p>
        <h2>待整理箱</h2>
      </div>
      <button class="secondary-button" type="button" @click="load">刷新</button>
    </div>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted-copy">正在读取…</p>
    <div v-else-if="items.length" class="inbox-list">
      <article v-for="item in items" :key="item.id" class="inbox-item">
        <button class="inbox-track" type="button" @click="emit('select', item.trackId)">
          <strong>{{ item.title }}</strong>
          <span>{{ item.artist || '未知歌手' }}</span>
        </button>
        <p v-if="item.captureText">{{ item.captureText }}</p>
        <div>
          <time>{{ new Date(item.capturedAt).toLocaleString('zh-CN') }}</time>
          <button
            class="text-button"
            type="button"
            :disabled="resolvingId === item.id"
            @click="resolve(item.id)"
          >
            {{ resolvingId === item.id ? '处理中…' : '标记已整理' }}
          </button>
        </div>
      </article>
    </div>
    <div v-else class="empty-state small">
      <strong>没有待整理记录</strong>
      <p>快捷小窗中选择“稍后整理”的歌曲会出现在这里。</p>
    </div>
  </section>
</template>
