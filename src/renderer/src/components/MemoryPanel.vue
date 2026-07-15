<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { LibraryApi, MemoryDto, MemoryFormInput, TrackSummaryDto } from '@shared/contracts'

const props = defineProps<{
  api: LibraryApi
  memories: MemoryDto[]
  tracks: TrackSummaryDto[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

const emptyForm = (): MemoryFormInput => ({
  title: '',
  description: '',
  happenedAt: '',
  location: '',
  people: '',
  trackIds: []
})

const form = reactive(emptyForm())
const editingId = ref<number | null>(null)
const busy = ref(false)
const error = ref('')

function editMemory(memory: MemoryDto): void {
  editingId.value = memory.id
  Object.assign(form, {
    title: memory.title,
    description: memory.description,
    happenedAt: toLocalDateTime(memory.happenedAt),
    location: memory.location ?? '',
    people: memory.people ?? '',
    trackIds: [...memory.trackIds]
  })
  error.value = ''
}

function resetForm(): void {
  editingId.value = null
  Object.assign(form, emptyForm())
  error.value = ''
}

async function saveMemory(): Promise<void> {
  error.value = ''
  if (!form.title.trim()) {
    error.value = '请输入事件名称'
    return
  }

  busy.value = true
  try {
    const result = editingId.value
      ? await props.api.updateMemory({ memoryId: editingId.value, ...form })
      : await props.api.createMemory({ ...form })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    resetForm()
    emit('refresh')
  } catch {
    error.value = '保存事件失败，请重试'
  } finally {
    busy.value = false
  }
}

async function deleteMemory(memory: MemoryDto): Promise<void> {
  if (!window.confirm(`删除事件“${memory.title}”？关联歌曲不会被删除。`)) return
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.deleteMemory({ memoryId: memory.id })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    if (editingId.value === memory.id) resetForm()
    emit('refresh')
  } catch {
    error.value = '删除事件失败，请重试'
  } finally {
    busy.value = false
  }
}

function toLocalDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function eventDate(value: string | null): string {
  if (!value) return '时间待补充'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function trackNames(memory: MemoryDto): string {
  const names = memory.trackIds
    .map((id) => props.tracks.find((track) => track.id === id)?.title)
    .filter((name): name is string => Boolean(name))
  return names.length ? names.join('、') : '未关联歌曲'
}
</script>

<template>
  <section class="panel events-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">MEMORIES</p>
        <h2>事件与记忆</h2>
      </div>
      <span class="count-badge">{{ memories.length }}</span>
    </div>

    <form data-testid="memory-form" @submit.prevent="saveMemory">
      <div class="form-title-row">
        <strong>{{ editingId ? '编辑事件' : '记录一个事件' }}</strong>
        <button v-if="editingId" class="text-button" type="button" @click="resetForm">
          取消编辑
        </button>
      </div>
      <label
        ><span>事件名称 *</span
        ><input
          v-model="form.title"
          data-testid="memory-title-input"
          maxlength="200"
          placeholder="例如：青海湖自驾"
      /></label>
      <label><span>时间</span><input v-model="form.happenedAt" type="datetime-local" /></label>
      <div class="field-row">
        <label
          ><span>地点</span
          ><input v-model="form.location" maxlength="500" placeholder="城市、场所或一段路"
        /></label>
        <label
          ><span>人物</span><input v-model="form.people" maxlength="500" placeholder="同行的人"
        /></label>
      </div>
      <label
        ><span>描述</span
        ><textarea
          v-model="form.description"
          rows="3"
          maxlength="10000"
          placeholder="发生了什么？音乐在其中扮演了什么角色？"
        ></textarea>
      </label>

      <fieldset class="track-association">
        <legend>关联歌曲（可多选）</legend>
        <div
          v-if="tracks.length"
          class="check-grid compact-checks"
          data-testid="memory-track-options"
        >
          <label v-for="track in tracks" :key="track.id" class="check-chip">
            <input v-model="form.trackIds" type="checkbox" :value="track.id" />
            {{ track.title }}
          </label>
        </div>
        <p v-else class="muted-copy">先收录歌曲，再为事件建立关联。</p>
      </fieldset>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button full-width" type="submit" :disabled="busy">
        {{ busy ? '正在保存…' : editingId ? '保存事件修改' : '保存事件' }}
      </button>
    </form>

    <div v-if="memories.length" class="event-list">
      <article v-for="memory in memories" :key="memory.id" class="event-card">
        <div class="event-card-header">
          <div>
            <time>{{ eventDate(memory.happenedAt) }}</time>
            <h3>{{ memory.title }}</h3>
          </div>
          <div class="button-row">
            <button class="text-button" type="button" :disabled="busy" @click="editMemory(memory)">
              编辑
            </button>
            <button
              class="text-button danger"
              type="button"
              :disabled="busy"
              @click="deleteMemory(memory)"
            >
              删除
            </button>
          </div>
        </div>
        <p v-if="memory.description">{{ memory.description }}</p>
        <dl class="event-meta">
          <div>
            <dt>地点</dt>
            <dd>{{ memory.location || '—' }}</dd>
          </div>
          <div>
            <dt>人物</dt>
            <dd>{{ memory.people || '—' }}</dd>
          </div>
          <div>
            <dt>歌曲</dt>
            <dd>{{ trackNames(memory) }}</dd>
          </div>
        </dl>
      </article>
    </div>
    <div v-else class="empty-state small">
      <strong>还没有事件</strong>
      <p>一次旅途、一段关系或某个普通夜晚，都可以成为找回歌曲的线索。</p>
    </div>
  </section>
</template>
