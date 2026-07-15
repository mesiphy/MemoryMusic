<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { ApiResult, TrackDetailDto, TrackFormInput } from '@shared/contracts'

const props = defineProps<{
  save: (input: TrackFormInput) => Promise<ApiResult<TrackDetailDto>>
}>()

const emptyForm = (): TrackFormInput => ({
  title: '',
  artist: '',
  album: '',
  neteaseId: '',
  neteaseUrl: ''
})

const form = reactive(emptyForm())
const busy = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})

async function submit(): Promise<void> {
  error.value = ''
  fieldErrors.value = {}

  if (!form.title.trim()) {
    fieldErrors.value = { title: '请输入歌曲名称' }
    return
  }

  busy.value = true
  try {
    const result = await props.save({ ...form })
    if (!result.ok) {
      error.value = result.error.message
      fieldErrors.value = result.error.fieldErrors ?? {}
      return
    }

    Object.assign(form, emptyForm())
  } catch {
    error.value = '保存歌曲失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel create-track-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">ADD TRACK</p>
        <h2>收录一首歌</h2>
      </div>
      <span class="step-badge">约 30 秒</span>
    </div>

    <form data-testid="track-create-form" @submit.prevent="submit">
      <label>
        <span>歌曲名称 *</span>
        <input
          v-model="form.title"
          data-testid="track-title-input"
          maxlength="200"
          placeholder="例如：夜曲"
          :aria-invalid="Boolean(fieldErrors.title)"
        />
        <small v-if="fieldErrors.title" class="field-error">{{ fieldErrors.title }}</small>
      </label>

      <div class="field-row">
        <label>
          <span>歌手</span>
          <input v-model="form.artist" maxlength="200" placeholder="可稍后补充" />
        </label>
        <label>
          <span>专辑</span>
          <input v-model="form.album" maxlength="200" placeholder="可选" />
        </label>
      </div>

      <details class="optional-fields">
        <summary>添加网易云原始信息（可选）</summary>
        <label>
          <span>歌曲 ID</span>
          <input v-model="form.neteaseId" inputmode="numeric" placeholder="185924" />
          <small v-if="fieldErrors.neteaseId" class="field-error">{{
            fieldErrors.neteaseId
          }}</small>
        </label>
        <label>
          <span>歌曲链接</span>
          <input v-model="form.neteaseUrl" type="url" placeholder="https://music.163.com/…" />
          <small v-if="fieldErrors.neteaseUrl" class="field-error">{{
            fieldErrors.neteaseUrl
          }}</small>
        </label>
      </details>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button full-width" type="submit" :disabled="busy">
        {{ busy ? '正在保存…' : '保存并开始标注' }}
      </button>
    </form>
  </section>
</template>
