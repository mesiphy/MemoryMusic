<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { CueKind, LibraryApi, TagDto, TrackDetailDto, TrackFormInput } from '@shared/contracts'

const props = defineProps<{
  api: LibraryApi
  track: TrackDetailDto
  tags: TagDto[]
}>()

const emit = defineEmits<{
  refresh: []
  deleted: []
}>()

const emptyTrackForm = (): TrackFormInput => ({
  title: '',
  artist: '',
  album: '',
  neteaseId: '',
  neteaseUrl: ''
})

const trackForm = reactive(emptyTrackForm())
const selectedTagIds = ref<number[]>([])
const noteDraft = ref('')
const noteEdits = reactive<Record<number, string>>({})
const cueDraft = reactive<{ name: string; kind: CueKind }>({ name: '', kind: 'alias' })
const cueEdits = reactive<Record<number, { name: string; kind: CueKind }>>({})
const busy = ref(false)
const error = ref('')

watch(
  () => props.track,
  (track) => {
    const netease = track.providerTracks.find((provider) => provider.provider === 'netease')
    Object.assign(trackForm, {
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
      neteaseId: netease?.providerTrackId ?? '',
      neteaseUrl: netease?.url ?? ''
    })
    selectedTagIds.value = track.tags.map((tag) => tag.id)

    for (const id of Object.keys(noteEdits).map(Number)) delete noteEdits[id]
    for (const note of track.notes) noteEdits[note.id] = note.body

    for (const id of Object.keys(cueEdits).map(Number)) delete cueEdits[id]
    for (const cue of track.cues) cueEdits[cue.id] = { name: cue.name, kind: cue.kind }
  },
  { deep: true, immediate: true }
)

async function updateTrack(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.updateTrack({ trackId: props.track.id, ...trackForm })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '保存歌曲资料失败，请重试'
  } finally {
    busy.value = false
  }
}

async function deleteTrack(): Promise<void> {
  if (!window.confirm(`删除歌曲“${props.track.title}”及其个人标注？`)) return
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.deleteTrack({ trackId: props.track.id })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('deleted')
  } catch {
    error.value = '删除歌曲失败，请重试'
  } finally {
    busy.value = false
  }
}

async function saveTags(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.setTrackTags({
      trackId: props.track.id,
      tagIds: selectedTagIds.value
    })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '保存标签关联失败，请重试'
  } finally {
    busy.value = false
  }
}

async function createNote(): Promise<void> {
  error.value = ''
  if (!noteDraft.value.trim()) {
    error.value = '请输入感悟内容'
    return
  }
  busy.value = true
  try {
    const result = await props.api.createNote({
      trackId: props.track.id,
      body: noteDraft.value
    })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    noteDraft.value = ''
    emit('refresh')
  } catch {
    error.value = '保存感悟失败，请重试'
  } finally {
    busy.value = false
  }
}

async function updateNote(noteId: number): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.updateNote({ noteId, body: noteEdits[noteId] ?? '' })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '保存感悟失败，请重试'
  } finally {
    busy.value = false
  }
}

async function deleteNote(noteId: number): Promise<void> {
  if (!window.confirm('删除这条感悟？')) return
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.deleteNote({ noteId })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '删除感悟失败，请重试'
  } finally {
    busy.value = false
  }
}

async function createCue(): Promise<void> {
  error.value = ''
  if (!cueDraft.name.trim()) {
    error.value = '请输入召回线索'
    return
  }
  busy.value = true
  try {
    const result = await props.api.createCue({ trackId: props.track.id, ...cueDraft })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    cueDraft.name = ''
    cueDraft.kind = 'alias'
    emit('refresh')
  } catch {
    error.value = '保存召回线索失败，请重试'
  } finally {
    busy.value = false
  }
}

async function updateCue(cueId: number): Promise<void> {
  const draft = cueEdits[cueId]
  if (!draft) return
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.updateCue({ cueId, ...draft })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '保存召回线索失败，请重试'
  } finally {
    busy.value = false
  }
}

async function deleteCue(cueId: number): Promise<void> {
  if (!window.confirm('删除这条召回线索？')) return
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.deleteCue({ cueId })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '删除召回线索失败，请重试'
  } finally {
    busy.value = false
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function cueLabel(kind: CueKind): string {
  return { alias: '别名', lyric: '错记歌词', cue: '其他线索' }[kind]
}
</script>

<template>
  <article class="track-detail" data-testid="track-detail">
    <header class="detail-header">
      <div>
        <p class="eyebrow">TRACK DETAIL</p>
        <h1>{{ track.title }}</h1>
        <p>
          {{ track.artist || '未知歌手' }}<span v-if="track.album"> · {{ track.album }}</span>
        </p>
      </div>
      <button class="text-button danger" type="button" :disabled="busy" @click="deleteTrack">
        删除歌曲
      </button>
    </header>

    <p v-if="error" class="form-error sticky-error" role="alert">{{ error }}</p>

    <section class="detail-section">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">METADATA</p>
          <h2>基础资料</h2>
        </div>
      </div>
      <form @submit.prevent="updateTrack">
        <div class="field-row">
          <label><span>歌曲名称 *</span><input v-model="trackForm.title" maxlength="200" /></label>
          <label><span>歌手</span><input v-model="trackForm.artist" maxlength="200" /></label>
        </div>
        <div class="field-row">
          <label><span>专辑</span><input v-model="trackForm.album" maxlength="200" /></label>
          <label
            ><span>网易云 ID</span><input v-model="trackForm.neteaseId" inputmode="numeric"
          /></label>
        </div>
        <label><span>网易云链接</span><input v-model="trackForm.neteaseUrl" type="url" /></label>
        <div class="button-row">
          <button class="secondary-button" type="submit" :disabled="busy">保存资料</button>
        </div>
      </form>
    </section>

    <section class="detail-section">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">TAGS</p>
          <h2>标签</h2>
        </div>
        <span class="count-badge">{{ selectedTagIds.length }}</span>
      </div>
      <div v-if="tags.length" class="check-grid" data-testid="tag-options">
        <label v-for="tag in tags" :key="tag.id" class="check-chip">
          <input v-model="selectedTagIds" type="checkbox" :value="tag.id" />
          <span class="tag-color" :style="{ backgroundColor: tag.color || '#827a70' }"></span>
          {{ tag.name }}
        </label>
      </div>
      <p v-else class="muted-copy">先在左侧创建标签，再关联到这首歌。</p>
      <button
        v-if="tags.length"
        data-testid="save-track-tags"
        class="secondary-button"
        type="button"
        :disabled="busy"
        @click="saveTags"
      >
        保存标签关联
      </button>
    </section>

    <section class="detail-section">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">NOTES</p>
          <h2>感悟</h2>
        </div>
        <span class="count-badge">{{ track.notes.length }}</span>
      </div>
      <form class="composer" @submit.prevent="createNote">
        <textarea
          v-model="noteDraft"
          data-testid="new-note-input"
          maxlength="5000"
          rows="3"
          placeholder="当时为什么记住它？"
        ></textarea>
        <button class="secondary-button" type="submit" :disabled="busy">添加一条感悟</button>
      </form>
      <div v-if="track.notes.length" class="stack-list">
        <article v-for="note in track.notes" :key="note.id" class="note-card">
          <time :datetime="note.createdAt">{{ formatDate(note.createdAt) }}</time>
          <textarea v-model="noteEdits[note.id]" rows="3"></textarea>
          <div class="button-row">
            <button class="text-button" type="button" :disabled="busy" @click="updateNote(note.id)">
              保存修改
            </button>
            <button
              class="text-button danger"
              type="button"
              :disabled="busy"
              @click="deleteNote(note.id)"
            >
              删除
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="detail-section">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">RECALL CUES</p>
          <h2>召回线索</h2>
        </div>
        <span class="count-badge">{{ track.cues.length }}</span>
      </div>
      <form class="cue-composer" @submit.prevent="createCue">
        <select v-model="cueDraft.kind" aria-label="线索类型">
          <option value="alias">别名</option>
          <option value="lyric">错记歌词</option>
          <option value="cue">其他线索</option>
        </select>
        <input
          v-model="cueDraft.name"
          data-testid="new-cue-input"
          maxlength="500"
          placeholder="例如：我一直记成的那句歌词"
        />
        <button class="secondary-button" type="submit" :disabled="busy">添加</button>
      </form>
      <div v-if="track.cues.length" class="stack-list">
        <div v-for="cue in track.cues" :key="cue.id" class="cue-row">
          <select v-model="cueEdits[cue.id].kind" :aria-label="`线索类型 ${cue.id}`">
            <option value="alias">别名</option>
            <option value="lyric">错记歌词</option>
            <option value="cue">其他线索</option>
          </select>
          <input v-model="cueEdits[cue.id].name" :aria-label="cueLabel(cue.kind)" />
          <button class="icon-button" type="button" :disabled="busy" @click="updateCue(cue.id)">
            ✓
          </button>
          <button
            class="icon-button danger"
            type="button"
            :disabled="busy"
            @click="deleteCue(cue.id)"
          >
            ×
          </button>
        </div>
      </div>
    </section>

    <section class="detail-section">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">MEMORIES</p>
          <h2>相关事件</h2>
        </div>
        <span class="count-badge">{{ track.memories.length }}</span>
      </div>
      <div v-if="track.memories.length" class="memory-links">
        <article v-for="memory in track.memories" :key="memory.id">
          <strong>{{ memory.title }}</strong>
          <span
            >{{ memory.location || '未填写地点'
            }}<template v-if="memory.people"> · {{ memory.people }}</template></span
          >
          <p>{{ memory.description || '暂无描述' }}</p>
        </article>
      </div>
      <p v-else class="muted-copy">尚未关联事件。可在右侧事件面板中一次关联多首歌。</p>
    </section>
  </article>
</template>
