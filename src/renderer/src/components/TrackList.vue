<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TrackSummaryDto } from '@shared/contracts'

const props = defineProps<{
  tracks: TrackSummaryDto[]
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [trackId: number]
}>()

const showUnannotatedOnly = ref(false)
const unannotatedCount = computed(
  () => props.tracks.filter((track) => track.personalCueCount === 0).length
)
const visibleTracks = computed(() =>
  showUnannotatedOnly.value
    ? props.tracks.filter((track) => track.personalCueCount === 0)
    : props.tracks
)
</script>

<template>
  <section class="panel track-list-panel">
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">LIBRARY</p>
        <h2>歌曲资料</h2>
      </div>
      <span class="count-badge">
        {{ showUnannotatedOnly ? `${visibleTracks.length}/${tracks.length}` : tracks.length }}
      </span>
    </div>

    <template v-if="tracks.length">
      <label class="track-filter">
        <input v-model="showUnannotatedOnly" type="checkbox" />
        <span>只看待补线索（{{ unannotatedCount }}）</span>
      </label>

      <div v-if="visibleTracks.length" class="track-list" data-testid="track-list">
        <button
          v-for="track in visibleTracks"
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
          <span
            class="track-cue-status"
            :class="{ pending: track.personalCueCount === 0 }"
            data-testid="track-cue-status"
          >
            {{
              track.personalCueCount > 0
                ? `已有 ${track.personalCueCount} 条个人线索`
                : '待补个人线索'
            }}
          </span>
          <span v-if="track.tags.length" class="mini-tags">
            <span v-for="tag in track.tags.slice(0, 3)" :key="tag.id">#{{ tag.name }}</span>
          </span>
        </button>
      </div>

      <div v-else class="empty-state compact-empty" data-testid="track-filter-empty">
        <strong>没有待补歌曲</strong>
        <p>当前曲库中的每首歌都已经有至少一条个人线索。</p>
      </div>
    </template>

    <div v-else class="empty-state" data-testid="track-empty-state">
      <span class="empty-icon">♫</span>
      <strong>资料库还是空的</strong>
      <p>从上方收录第一首歌，再留下一个你真正记得的线索。</p>
    </div>
  </section>
</template>
