<script setup lang="ts">
import type { TrackSummaryDto } from '@shared/contracts'

defineProps<{
  tracks: TrackSummaryDto[]
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [trackId: number]
}>()
</script>

<template>
  <section class="panel track-list-panel">
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">LIBRARY</p>
        <h2>歌曲资料</h2>
      </div>
      <span class="count-badge">{{ tracks.length }}</span>
    </div>

    <div v-if="tracks.length" class="track-list" data-testid="track-list">
      <button
        v-for="track in tracks"
        :key="track.id"
        type="button"
        class="track-list-item"
        :class="{ active: selectedId === track.id }"
        @click="emit('select', track.id)"
      >
        <span class="track-title">{{ track.title }}</span>
        <span class="track-meta"
          >{{ track.artist || '未知歌手' }} · {{ track.album || '未填写专辑' }}</span
        >
        <span v-if="track.tags.length" class="mini-tags">
          <span v-for="tag in track.tags.slice(0, 3)" :key="tag.id">#{{ tag.name }}</span>
        </span>
      </button>
    </div>

    <div v-else class="empty-state" data-testid="track-empty-state">
      <span class="empty-icon">♫</span>
      <strong>资料库还是空的</strong>
      <p>从上方收录第一首歌，再留下一个你真正记得的线索。</p>
    </div>
  </section>
</template>
