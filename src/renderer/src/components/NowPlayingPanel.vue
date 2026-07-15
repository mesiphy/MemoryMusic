<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { NowPlayingDto, PlaybackApi } from '@shared/contracts'

const props = defineProps<{
  api: PlaybackApi
}>()

type ControlAction = 'pause' | 'resume' | 'next' | 'previous'

const nowPlaying = ref<NowPlayingDto | null>(null)
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const controlMessage = ref('')

const statusLabel = computed(() => {
  if (!nowPlaying.value) return '未检测到网易云媒体会话'
  return {
    playing: '正在播放',
    paused: '已暂停',
    stopped: '已停止',
    closed: '会话已关闭',
    unknown: '状态未知'
  }[nowPlaying.value.status]
})

onMounted(refresh)

async function refresh(): Promise<void> {
  error.value = ''
  controlMessage.value = ''
  busy.value = true
  try {
    const result = await props.api.getNowPlaying()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    nowPlaying.value = result.value
  } catch {
    error.value = '读取当前播放歌曲失败，请重试'
  } finally {
    busy.value = false
    loaded.value = true
  }
}

async function control(action: ControlAction): Promise<void> {
  error.value = ''
  controlMessage.value = ''
  busy.value = true
  try {
    const result = await props.api[action]()
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    if (!result.value.accepted) {
      error.value = '当前网易云媒体会话未接受这次控制操作'
      return
    }
    nowPlaying.value = result.value.nowPlaying
    controlMessage.value = '媒体控制已执行'
  } catch {
    error.value = '控制网易云音乐失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel now-playing-panel" data-testid="now-playing-panel">
    <div class="now-playing-copy">
      <p class="eyebrow">WINDOWS MEDIA SESSION</p>
      <template v-if="nowPlaying">
        <strong>{{ nowPlaying.title || '未知歌曲' }}</strong>
        <span>{{ nowPlaying.artist || '未知歌手' }} · {{ statusLabel }}</span>
      </template>
      <span v-else-if="loaded">{{ statusLabel }}</span>
      <span v-else>正在读取网易云媒体会话…</span>
    </div>
    <div class="media-controls">
      <button
        class="icon-button"
        type="button"
        title="上一首"
        :disabled="busy || !nowPlaying"
        data-testid="media-previous"
        @click="control('previous')"
      >
        ‹
      </button>
      <button
        class="secondary-button"
        type="button"
        :disabled="busy || !nowPlaying"
        data-testid="media-resume"
        @click="control('resume')"
      >
        播放
      </button>
      <button
        class="secondary-button"
        type="button"
        :disabled="busy || !nowPlaying"
        data-testid="media-pause"
        @click="control('pause')"
      >
        暂停
      </button>
      <button
        class="icon-button"
        type="button"
        title="下一首"
        :disabled="busy || !nowPlaying"
        data-testid="media-next"
        @click="control('next')"
      >
        ›
      </button>
      <button class="text-button" type="button" :disabled="busy" @click="refresh">刷新</button>
    </div>
    <p v-if="error" class="playback-panel-message error" role="alert">{{ error }}</p>
    <p v-else-if="controlMessage" class="playback-panel-message success" role="status">
      {{ controlMessage }}
    </p>
  </section>
</template>
