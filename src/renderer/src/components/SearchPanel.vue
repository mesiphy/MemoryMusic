<script setup lang="ts">
import { reactive, ref } from 'vue'
import type {
  LibraryApi,
  PlaybackApi,
  SearchMissingField,
  SearchResponseDto
} from '@shared/contracts'

const props = defineProps<{
  api: LibraryApi
  playbackApi: PlaybackApi
}>()

const emit = defineEmits<{
  select: [trackId: number]
}>()

const query = ref('')
const response = ref<SearchResponseDto | null>(null)
const busy = ref(false)
const error = ref('')
const feedbackField = ref<SearchMissingField | ''>('')
const feedbackSaved = ref(false)
const indexMessage = ref('')
const playbackBusyTrackId = ref<number | null>(null)
const playbackNotices = reactive<
  Record<
    number,
    { kind: 'success' | 'error'; message: string; showWebFallback: boolean } | undefined
  >
>({})

async function submit(): Promise<void> {
  error.value = ''
  indexMessage.value = ''
  feedbackSaved.value = false
  if (!query.value.trim()) {
    error.value = '请输入记得的歌名、场景或个人线索'
    return
  }

  response.value = null
  busy.value = true
  try {
    const result = await props.api.search({ query: query.value })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    response.value = result.value
    feedbackField.value = ''
  } catch {
    error.value = '搜索失败，请重试'
  } finally {
    busy.value = false
  }
}

function clearSearch(): void {
  query.value = ''
  response.value = null
  error.value = ''
  feedbackField.value = ''
  feedbackSaved.value = false
  for (const trackId of Object.keys(playbackNotices).map(Number)) delete playbackNotices[trackId]
}

async function playTrack(trackId: number): Promise<void> {
  playbackBusyTrackId.value = trackId
  delete playbackNotices[trackId]
  try {
    const result = await props.playbackApi.play({ trackId })
    if (!result.ok) {
      playbackNotices[trackId] = {
        kind: 'error',
        message: result.error.message,
        showWebFallback: result.error.code === 'PLAYBACK'
      }
      return
    }
    playbackNotices[trackId] = {
      kind: 'success',
      message: result.value.message,
      showWebFallback: result.value.method === 'protocol'
    }
  } catch {
    playbackNotices[trackId] = {
      kind: 'error',
      message: '发起播放失败，请重试',
      showWebFallback: true
    }
  } finally {
    playbackBusyTrackId.value = null
  }
}

async function openWeb(trackId: number): Promise<void> {
  playbackBusyTrackId.value = trackId
  try {
    const result = await props.playbackApi.openWeb({ trackId })
    if (!result.ok) {
      playbackNotices[trackId] = {
        kind: 'error',
        message: result.error.message,
        showWebFallback: true
      }
      return
    }
    playbackNotices[trackId] = {
      kind: 'success',
      message: result.value.message,
      showWebFallback: false
    }
  } catch {
    playbackNotices[trackId] = {
      kind: 'error',
      message: '打开歌曲网页失败，请重试',
      showWebFallback: true
    }
  } finally {
    playbackBusyTrackId.value = null
  }
}

async function recordFeedback(): Promise<void> {
  error.value = ''
  const queryLogId = response.value?.noResultLogId
  if (!queryLogId || !feedbackField.value) {
    error.value = '请选择原本记得的线索类型'
    return
  }

  busy.value = true
  try {
    const result = await props.api.recordSearchFeedback({
      queryLogId,
      missingField: feedbackField.value
    })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    feedbackSaved.value = true
  } catch {
    error.value = '记录搜索反馈失败，请重试'
  } finally {
    busy.value = false
  }
}

async function rebuildIndex(): Promise<void> {
  error.value = ''
  indexMessage.value = ''
  busy.value = true
  try {
    const result = await props.api.rebuildSearchIndex()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    indexMessage.value = `索引已重建，共 ${result.value.documentCount} 首歌`
  } catch {
    error.value = '重建搜索索引失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel search-panel">
    <div class="search-heading">
      <div>
        <p class="eyebrow">RECALL SEARCH</p>
        <h2>用你还记得的任何线索找歌</h2>
      </div>
      <button class="text-button" type="button" :disabled="busy" @click="rebuildIndex">
        重建索引
      </button>
    </div>

    <form class="search-form" data-testid="search-form" @submit.prevent="submit">
      <label class="search-input-wrap">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input
          v-model="query"
          data-testid="search-input"
          maxlength="200"
          autocomplete="off"
          placeholder="例如：青海湖自驾、毕业晚会、我记错的那句歌词…"
        />
      </label>
      <button class="primary-button search-button" type="submit" :disabled="busy">
        {{ busy ? '正在查找…' : '找回歌曲' }}
      </button>
      <button v-if="response" class="text-button" type="button" @click="clearSearch">清除</button>
    </form>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="indexMessage" class="success-copy" role="status">{{ indexMessage }}</p>

    <div v-if="response?.results.length" class="search-results" data-testid="search-results">
      <div class="search-summary">
        <strong>找到 {{ response.results.length }} 首</strong>
        <span>{{ response.mode === 'fts' ? '全文索引匹配' : '短词包含匹配' }}</span>
      </div>
      <div class="search-result-grid">
        <article
          v-for="result in response.results"
          :key="result.track.id"
          class="search-result-card"
        >
          <button
            class="search-result-select"
            type="button"
            @click="emit('select', result.track.id)"
          >
            <span class="result-track-copy">
              <strong>{{ result.track.title }}</strong>
              <span
                >{{ result.track.artist || '未知歌手' }} ·
                {{ result.track.album || '未填写专辑' }}</span
              >
            </span>
            <span class="match-reasons">
              <span
                v-for="(match, matchIndex) in result.matches"
                :key="`${match.field}-${matchIndex}-${match.value}`"
              >
                <small>命中{{ match.label }}</small>
                <span>{{ match.value }}</span>
              </span>
            </span>
            <span v-if="result.matchedPersonalField" class="personal-match-badge"
              >个人线索优先</span
            >
          </button>
          <div class="playback-actions">
            <button
              class="secondary-button"
              :data-testid="`play-track-${result.track.id}`"
              type="button"
              :disabled="playbackBusyTrackId === result.track.id"
              @click="playTrack(result.track.id)"
            >
              {{ playbackBusyTrackId === result.track.id ? '正在唤起…' : '用网易云播放' }}
            </button>
            <button
              v-if="playbackNotices[result.track.id]?.showWebFallback"
              class="text-button"
              :data-testid="`open-web-${result.track.id}`"
              type="button"
              :disabled="playbackBusyTrackId === result.track.id"
              @click="openWeb(result.track.id)"
            >
              打开歌曲网页
            </button>
          </div>
          <p
            v-if="playbackNotices[result.track.id]"
            class="playback-notice"
            :class="playbackNotices[result.track.id]?.kind"
            :role="playbackNotices[result.track.id]?.kind === 'error' ? 'alert' : 'status'"
          >
            {{ playbackNotices[result.track.id]?.message }}
          </p>
        </article>
      </div>
    </div>

    <div v-else-if="response" class="search-empty" data-testid="search-empty">
      <div>
        <strong>没有找到“{{ response.query }}”</strong>
        <p>这次无结果已保存在本地。标记你原本记得的字段，之后补资料时会更有方向。</p>
      </div>
      <div v-if="!feedbackSaved" class="feedback-controls">
        <select
          v-model="feedbackField"
          data-testid="missing-field-select"
          aria-label="缺失线索类型"
        >
          <option value="">原本记得的是…</option>
          <option value="title">歌名</option>
          <option value="artist">歌手</option>
          <option value="album">专辑</option>
          <option value="alias">别名</option>
          <option value="lyric">歌词或错记歌词</option>
          <option value="tag">标签</option>
          <option value="note">个人感悟</option>
          <option value="memory">事件、地点或人物</option>
          <option value="other">其他线索</option>
        </select>
        <button
          class="secondary-button"
          data-testid="save-search-feedback"
          type="button"
          :disabled="busy"
          @click="recordFeedback"
        >
          记录缺失字段
        </button>
      </div>
      <p v-else class="success-copy" role="status">已记录，下次整理资料时可以据此补充。</p>
    </div>
  </section>
</template>
