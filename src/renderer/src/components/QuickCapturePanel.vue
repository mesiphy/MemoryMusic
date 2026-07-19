<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { CaptureApi, NowPlayingDto, QuickCaptureKind } from '@shared/contracts'

const props = defineProps<{ api: CaptureApi }>()
const emit = defineEmits<{ saved: [] }>()

const context = ref<NowPlayingDto | null>(null)
const kind = ref<QuickCaptureKind>('note')
const text = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

const placeholder = computed(() => {
  if (kind.value === 'tag') return '输入一个标签，例如：深夜循环'
  if (kind.value === 'note') return '写下一句话…'
  return '可以留空，稍后在待整理箱补充'
})

onMounted(loadContext)

async function loadContext(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await props.api.getContext()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    context.value = result.value
  } catch {
    error.value = '读取当前播放歌曲失败，请重试'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await props.api.capture({ kind: kind.value, text: text.value })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    success.value = result.value.kind === 'inbox' ? '已放入待整理箱' : '已保存到个人资料库'
    text.value = ''
    emit('saved')
  } catch {
    error.value = '保存快速记录失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="quick-capture-shell">
    <section class="quick-capture-card panel">
      <div class="quick-capture-heading">
        <div>
          <p class="eyebrow">QUICK CAPTURE</p>
          <h1>记住这一刻</h1>
        </div>
        <button class="icon-button" type="button" title="刷新当前歌曲" @click="loadContext">
          ↻
        </button>
      </div>

      <div v-if="loading" class="capture-media muted-copy">正在读取当前歌曲…</div>
      <div v-else-if="context" class="capture-media">
        <strong>{{ context.title }}</strong>
        <span>{{ context.artist || '未知歌手' }}</span>
        <small>{{ context.status === 'playing' ? '正在播放' : '媒体会话已连接' }}</small>
      </div>
      <div v-else class="capture-media empty-capture">
        <strong>没有检测到正在播放的歌曲</strong>
        <span>先在网易云音乐开始播放，再点击刷新。</span>
      </div>

      <form data-testid="quick-capture-form" @submit.prevent="save">
        <div class="capture-kind-tabs" role="radiogroup" aria-label="记录方式">
          <label :class="{ active: kind === 'tag' }">
            <input v-model="kind" type="radio" value="tag" />标签
          </label>
          <label :class="{ active: kind === 'note' }">
            <input v-model="kind" type="radio" value="note" />一句话
          </label>
          <label :class="{ active: kind === 'inbox' }">
            <input v-model="kind" type="radio" value="inbox" />稍后整理
          </label>
        </div>

        <label>
          {{ kind === 'tag' ? '标签' : kind === 'note' ? '感悟' : '临时备注（可选）' }}
          <input
            v-if="kind === 'tag'"
            v-model="text"
            data-testid="quick-capture-text"
            name="captureText"
            maxlength="80"
            :placeholder="placeholder"
            autofocus
          />
          <textarea
            v-else
            v-model="text"
            data-testid="quick-capture-text"
            name="captureText"
            maxlength="10000"
            :placeholder="placeholder"
            autofocus
          ></textarea>
        </label>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <p v-if="success" class="success-copy" role="status">{{ success }}</p>

        <button
          class="primary-button full-width"
          type="submit"
          :disabled="saving || !context || (kind !== 'inbox' && !text.trim())"
        >
          {{ saving ? '正在保存…' : kind === 'inbox' ? '放入待整理箱' : '保存' }}
        </button>
      </form>
      <p class="capture-shortcut-hint">Ctrl + Shift + M 随时唤起</p>
    </section>
  </main>
</template>
