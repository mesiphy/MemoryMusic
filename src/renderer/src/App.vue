<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { RuntimeInfo } from '@shared/contracts'

const runtime = ref<RuntimeInfo | null>(null)
const runtimeError = ref('')

onMounted(async () => {
  try {
    runtime.value = await window.memoryMusic.getRuntimeInfo()
  } catch (error) {
    runtimeError.value = error instanceof Error ? error.message : '无法读取 Electron 运行信息'
  }
})
</script>

<template>
  <main class="shell">
    <section class="hero">
      <div class="eyebrow">PERSONAL MUSIC MEMORY</div>
      <h1>记得感受，<br />就能找回那首歌。</h1>
      <p class="intro">
        MemoryMusic
        是网易云音乐之上的个人记忆与检索层。把标签、感悟和事件留在本地，用任何记得的线索重新找到音乐。
      </p>

      <div class="search-preview" aria-label="搜索功能预览">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <span>#深夜散步 鼓点强 大学时期</span>
        <kbd>Ctrl K</kbd>
      </div>
    </section>

    <section class="status-card">
      <header>
        <span class="status-dot" aria-hidden="true"></span>
        <strong>桌面脚手架已就绪</strong>
      </header>

      <dl>
        <div>
          <dt>界面</dt>
          <dd>Vue 3 + TypeScript</dd>
        </div>
        <div>
          <dt>桌面运行时</dt>
          <dd>Electron + electron-vite</dd>
        </div>
        <div>
          <dt>数据策略</dt>
          <dd>Local-first</dd>
        </div>
        <div>
          <dt>运行状态</dt>
          <dd v-if="runtime">Electron {{ runtime.versions.electron }} · {{ runtime.platform }}</dd>
          <dd v-else-if="runtimeError" class="error">{{ runtimeError }}</dd>
          <dd v-else>正在连接主进程…</dd>
        </div>
      </dl>

      <p class="next-step">下一步：建立歌曲、标签、感悟与事件的数据模型。</p>
    </section>
  </main>
</template>
