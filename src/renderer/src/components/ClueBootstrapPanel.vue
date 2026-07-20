<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CueKind, LibraryApi, TrackSummaryDto } from '@shared/contracts'

const TARGET_TRACK_COUNT = 20

const props = defineProps<{
  api: LibraryApi
  tracks: TrackSummaryDto[]
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [trackId: number]
  saved: [trackId: number]
}>()

const kind = ref<CueKind>('cue')
const text = ref('')
const busy = ref(false)
const error = ref('')
const success = ref('')

const annotatedTracks = computed(() => props.tracks.filter((track) => track.personalCueCount > 0))
const unannotatedTracks = computed(() =>
  props.tracks.filter((track) => track.personalCueCount === 0)
)
const targetCount = computed(() => Math.min(TARGET_TRACK_COUNT, props.tracks.length))
const targetProgress = computed(() => Math.min(annotatedTracks.value.length, targetCount.value))
const candidate = computed(() => {
  const selected = props.tracks.find((track) => track.id === props.selectedId)
  if (selected?.personalCueCount === 0) return selected
  return unannotatedTracks.value[0] ?? null
})

watch(
  () => candidate.value?.id,
  () => {
    text.value = ''
    error.value = ''
  }
)

async function save(): Promise<void> {
  const track = candidate.value
  error.value = ''
  success.value = ''

  if (!track) return
  if (!text.value.trim()) {
    error.value = '请写下一条你真的会记得的线索'
    return
  }

  busy.value = true
  try {
    const result = await props.api.createCue({
      trackId: track.id,
      kind: kind.value,
      name: text.value
    })
    if (!result.ok) {
      error.value = result.error.message
      return
    }

    text.value = ''
    kind.value = 'cue'
    success.value = `已为“${track.title}”保存线索`
    emit('saved', track.id)
  } catch {
    error.value = '保存线索失败，请重试'
  } finally {
    busy.value = false
  }
}

function skip(): void {
  const track = candidate.value
  if (!track || unannotatedTracks.value.length < 2) return
  const currentIndex = unannotatedTracks.value.findIndex((item) => item.id === track.id)
  const next = unannotatedTracks.value[(currentIndex + 1) % unannotatedTracks.value.length]
  success.value = ''
  emit('select', next.id)
}
</script>

<template>
  <section class="panel clue-bootstrap-panel" data-testid="clue-bootstrap-panel">
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">CLUE STARTER</p>
        <h2>线索冷启动</h2>
      </div>
      <span class="count-badge" data-testid="clue-target-progress">
        {{ targetProgress }}/{{ targetCount }}
      </span>
    </div>

    <p class="bootstrap-summary">
      已有个人线索 {{ annotatedTracks.length }} / {{ tracks.length }} 首 · 待补
      {{ unannotatedTracks.length }} 首
    </p>
    <progress
      class="bootstrap-progress"
      :value="targetProgress"
      :max="Math.max(targetCount, 1)"
      aria-label="线索冷启动进度"
    ></progress>

    <p v-if="targetCount > 0 && targetProgress >= targetCount" class="success-copy">
      已达到 {{ targetCount }} 首冷启动基线，可以开始积累真实忘歌任务。
    </p>

    <template v-if="candidate">
      <button
        class="bootstrap-track"
        type="button"
        data-testid="bootstrap-track"
        @click="emit('select', candidate.id)"
      >
        <strong>{{ candidate.title }}</strong>
        <span>{{ candidate.artist || '未知歌手' }} · {{ candidate.album || '未填写专辑' }}</span>
      </button>

      <form class="bootstrap-form" data-testid="bootstrap-form" @submit.prevent="save">
        <select v-model="kind" aria-label="冷启动线索类型">
          <option value="cue">场景、感受或声音</option>
          <option value="alias">自己的叫法</option>
          <option value="lyric">记得或记错的歌词</option>
        </select>
        <textarea
          v-model="text"
          data-testid="bootstrap-input"
          maxlength="500"
          rows="3"
          placeholder="例如：大学返校的夜班车上一直循环"
        ></textarea>
        <button class="secondary-button" type="submit" :disabled="busy">
          {{ busy ? '正在保存…' : '保存并换下一首' }}
        </button>
      </form>

      <button
        class="text-button bootstrap-skip"
        type="button"
        :disabled="busy || unannotatedTracks.length < 2"
        @click="skip"
      >
        对这首暂时没感觉，换一首
      </button>
    </template>

    <p v-else-if="tracks.length" class="success-copy">所有歌曲都已经有个人线索。</p>
    <p v-else class="muted-copy">同步或收录歌曲后，再开始留下个人线索。</p>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-else-if="success" class="success-copy" role="status">{{ success }}</p>
    <p class="bootstrap-hint">
      不必标注全部曲库。也可以播放网易云歌曲后按 Ctrl + Shift + M，随听随记。
    </p>
  </section>
</template>
