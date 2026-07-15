<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { LibraryApi, TagDto } from '@shared/contracts'

const props = defineProps<{
  api: LibraryApi
  tags: TagDto[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

const drafts = reactive<Record<number, { name: string; color: string }>>({})
const newName = ref('')
const newColor = ref('#d39b66')
const sourceTagId = ref<number | null>(null)
const targetTagId = ref<number | null>(null)
const busy = ref(false)
const error = ref('')

watch(
  () => props.tags,
  (tags) => {
    const currentIds = new Set(tags.map((tag) => tag.id))
    for (const id of Object.keys(drafts).map(Number)) {
      if (!currentIds.has(id)) delete drafts[id]
    }
    for (const tag of tags) {
      drafts[tag.id] = { name: tag.name, color: tag.color ?? '#d39b66' }
    }
  },
  { deep: true, immediate: true }
)

async function createTag(): Promise<void> {
  error.value = ''
  if (!newName.value.trim()) {
    error.value = '请输入标签名称'
    return
  }

  busy.value = true
  try {
    const result = await props.api.createTag({ name: newName.value, color: newColor.value })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    newName.value = ''
    emit('refresh')
  } catch {
    error.value = '保存标签失败，请重试'
  } finally {
    busy.value = false
  }
}

async function updateTag(tagId: number): Promise<void> {
  const draft = drafts[tagId]
  if (!draft) return
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.updateTag({ tagId, ...draft })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '保存标签失败，请重试'
  } finally {
    busy.value = false
  }
}

async function deleteTag(tag: TagDto): Promise<void> {
  if (!window.confirm(`删除标签“${tag.name}”？歌曲资料不会被删除。`)) return
  error.value = ''
  busy.value = true
  try {
    const result = await props.api.deleteTag({ tagId: tag.id })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    emit('refresh')
  } catch {
    error.value = '删除标签失败，请重试'
  } finally {
    busy.value = false
  }
}

async function mergeTags(): Promise<void> {
  error.value = ''
  if (!sourceTagId.value || !targetTagId.value || sourceTagId.value === targetTagId.value) {
    error.value = '请选择两个不同的标签'
    return
  }

  busy.value = true
  try {
    const result = await props.api.mergeTags({
      sourceTagId: sourceTagId.value,
      targetTagId: targetTagId.value
    })
    if (!result.ok) {
      error.value = result.error.message
      return
    }
    sourceTagId.value = null
    targetTagId.value = null
    emit('refresh')
  } catch {
    error.value = '合并标签失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel tag-manager-panel">
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">TAGS</p>
        <h2>标签管理</h2>
      </div>
    </div>

    <form class="inline-create" @submit.prevent="createTag">
      <input v-model="newName" maxlength="80" placeholder="新标签" aria-label="新标签名称" />
      <input v-model="newColor" class="color-input" type="color" aria-label="标签颜色" />
      <button class="secondary-button" type="submit" :disabled="busy">新增</button>
    </form>

    <div v-if="tags.length" class="tag-editor-list">
      <div v-for="tag in tags" :key="tag.id" class="tag-editor-row">
        <span class="tag-color" :style="{ backgroundColor: drafts[tag.id]?.color }"></span>
        <input v-model="drafts[tag.id].name" :aria-label="`标签 ${tag.name}`" />
        <input v-model="drafts[tag.id].color" class="color-input" type="color" />
        <button
          class="icon-button"
          type="button"
          title="保存标签"
          :disabled="busy"
          @click="updateTag(tag.id)"
        >
          ✓
        </button>
        <button
          class="icon-button danger"
          type="button"
          title="删除标签"
          :disabled="busy"
          @click="deleteTag(tag)"
        >
          ×
        </button>
      </div>
    </div>
    <p v-else class="muted-copy">还没有标签。先创建一个，再在歌曲详情中复用。</p>

    <details v-if="tags.length > 1" class="merge-box">
      <summary>合并重复标签</summary>
      <div class="merge-controls">
        <select v-model.number="sourceTagId" aria-label="被合并标签">
          <option :value="null">被合并标签</option>
          <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
        </select>
        <span>→</span>
        <select v-model.number="targetTagId" aria-label="保留标签">
          <option :value="null">保留标签</option>
          <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
        </select>
        <button class="secondary-button" type="button" :disabled="busy" @click="mergeTags">
          合并
        </button>
      </div>
    </details>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
