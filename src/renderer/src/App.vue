<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  ApiResult,
  LibrarySnapshotDto,
  RuntimeInfo,
  TrackDetailDto,
  TrackFormInput
} from '@shared/contracts'
import DataSafetyPanel from './components/DataSafetyPanel.vue'
import MemoryPanel from './components/MemoryPanel.vue'
import ImportPanel from './components/ImportPanel.vue'
import InboxPanel from './components/InboxPanel.vue'
import NowPlayingPanel from './components/NowPlayingPanel.vue'
import QuickCapturePanel from './components/QuickCapturePanel.vue'
import SearchPanel from './components/SearchPanel.vue'
import TagManager from './components/TagManager.vue'
import TrackCreateForm from './components/TrackCreateForm.vue'
import TrackDetail from './components/TrackDetail.vue'
import TrackList from './components/TrackList.vue'

const api = window.memoryMusic.library
const playbackApi = window.memoryMusic.playback
const importApi = window.memoryMusic.importer
const captureApi = window.memoryMusic.capture
const dataSafetyApi = window.memoryMusic.dataSafety
const isQuickCapture = new URLSearchParams(window.location.search).get('quickCapture') === '1'
const snapshot = ref<LibrarySnapshotDto>({ tracks: [], tags: [], memories: [] })
const selectedTrackId = ref<number | null>(null)
const selectedTrack = ref<TrackDetailDto | null>(null)
const runtime = ref<RuntimeInfo | null>(null)
const loading = ref(true)
const detailLoading = ref(false)
const loadError = ref('')

onMounted(async () => {
  if (isQuickCapture) {
    loading.value = false
    return
  }
  void window.memoryMusic
    .getRuntimeInfo()
    .then((value) => (runtime.value = value))
    .catch(() => undefined)
  await loadLibrary()
  window.addEventListener('focus', refreshAfterWindowFocus)
})

onBeforeUnmount(() => window.removeEventListener('focus', refreshAfterWindowFocus))

async function loadLibrary(preferredTrackId: number | null = selectedTrackId.value): Promise<void> {
  loading.value = true
  loadError.value = ''

  try {
    const result = await api.getLibrary()
    if (!result.ok) {
      loadError.value = result.error.message
      return
    }

    snapshot.value = result.value
    const availableIds = new Set(result.value.tracks.map((track) => track.id))
    const nextId =
      preferredTrackId && availableIds.has(preferredTrackId)
        ? preferredTrackId
        : (result.value.tracks[0]?.id ?? null)
    selectedTrackId.value = nextId

    if (nextId) await loadTrack(nextId)
    else selectedTrack.value = null
  } catch {
    loadError.value = '读取资料库失败，请重试'
  } finally {
    loading.value = false
  }
}

async function loadTrack(trackId: number): Promise<void> {
  selectedTrackId.value = trackId
  detailLoading.value = true
  loadError.value = ''
  try {
    const result = await api.getTrack({ trackId })
    if (!result.ok) {
      loadError.value = result.error.message
      selectedTrack.value = null
      return
    }
    selectedTrack.value = result.value
  } catch {
    loadError.value = '读取歌曲详情失败，请重试'
  } finally {
    detailLoading.value = false
  }
}

async function saveTrack(input: TrackFormInput): Promise<ApiResult<TrackDetailDto>> {
  const result = await api.createTrack(input)
  if (result.ok) await loadLibrary(result.value.id)
  return result
}

async function refreshSelected(): Promise<void> {
  await loadLibrary(selectedTrackId.value)
}

async function afterTrackDeleted(): Promise<void> {
  selectedTrackId.value = null
  selectedTrack.value = null
  await loadLibrary(null)
}

function closeQuickCaptureAfterSave(): void {
  window.setTimeout(() => window.close(), 450)
}

function refreshAfterWindowFocus(): void {
  void loadLibrary(selectedTrackId.value)
}
</script>

<template>
  <QuickCapturePanel v-if="isQuickCapture" :api="captureApi" @saved="closeQuickCaptureAfterSave" />
  <div v-else class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">MEMORY MUSIC · LOCAL FIRST</p>
        <h1>把记得的留下，<br />以后就能找回来。</h1>
      </div>
      <div class="runtime-pill">
        <span class="status-dot"></span>
        <span v-if="runtime"
          >Electron {{ runtime.versions.electron }} · {{ runtime.platform }}</span
        >
        <span v-else>本地资料库</span>
      </div>
    </header>

    <NowPlayingPanel :api="playbackApi" />

    <SearchPanel :api="api" :playback-api="playbackApi" @select="loadTrack" />

    <div v-if="loadError" class="load-error" role="alert">
      <span>{{ loadError }}</span>
      <button class="secondary-button" type="button" @click="loadLibrary()">重试</button>
    </div>

    <div class="library-grid">
      <aside class="sidebar-column">
        <TrackCreateForm :save="saveTrack" />
        <ImportPanel :api="importApi" @imported="refreshSelected" />
        <DataSafetyPanel :api="dataSafetyApi" />
        <TrackList :tracks="snapshot.tracks" :selected-id="selectedTrackId" @select="loadTrack" />
        <TagManager :api="api" :tags="snapshot.tags" @refresh="refreshSelected" />
      </aside>

      <main class="detail-panel panel">
        <div v-if="loading || detailLoading" class="loading-state">
          <span class="spinner"></span>
          <p>正在读取本地资料…</p>
        </div>
        <TrackDetail
          v-else-if="selectedTrack"
          :key="selectedTrack.id"
          :api="api"
          :track="selectedTrack"
          :tags="snapshot.tags"
          @refresh="refreshSelected"
          @deleted="afterTrackDeleted"
        />
        <div v-else class="empty-state detail-empty">
          <span class="empty-icon">♪</span>
          <strong>先选择或收录一首歌</strong>
          <p>歌曲详情里可以添加多个标签、感悟、事件和你独有的召回线索。</p>
        </div>
      </main>

      <aside class="events-column">
        <InboxPanel :api="captureApi" @select="loadTrack" />
        <MemoryPanel
          :api="api"
          :memories="snapshot.memories"
          :tracks="snapshot.tracks"
          @refresh="refreshSelected"
        />
      </aside>
    </div>
  </div>
</template>
