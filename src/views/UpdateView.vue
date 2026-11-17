<template>
  <div class="update-view">
    <section class="update-card">
      <h1>软件更新</h1>
      <p>
        当前版本 {{ version }} ·
        {{ updates.supported ? 'Windows 桌面版' : '当前平台请通过发布页下载' }}
      </p>
      <div role="status" aria-live="polite">
        <p v-if="updates.phase === 'checking'">正在检查新版本…</p>
        <p v-else-if="updates.phase === 'current'">当前已是最新版本。</p>
        <p v-else-if="updates.available">发现新版本 {{ updates.available.version }}</p>
        <p v-else>检查新版本，查看更新内容后选择安装。</p>
      </div>
      <pre v-if="updates.available?.notes" class="update-notes">{{ updates.available.notes }}</pre>
      <div v-if="['downloading', 'installing'].includes(updates.phase)">
        <p>
          {{
            updates.phase === 'installing'
              ? '正在安装，即将退出应用…'
              : `正在下载：${(updates.received / 1048576).toFixed(1)} MB`
          }}
        </p>
        <progress
          :value="updates.total ? updates.received : undefined"
          :max="updates.total || 1"
          aria-label="更新下载进度"
        />
      </div>
      <p v-if="updates.error" class="update-error" role="alert">{{ updates.error }}</p>
      <p v-if="updates.supported" class="update-hint">
        安装前会验证更新包签名。安装时会退出应用，请先结束当前操作。
      </p>
      <div class="update-actions">
        <Button v-if="updates.supported" :disabled="updates.busy" @click="updates.check()">{{
          updates.phase === 'checking' ? '检查中…' : '检查更新'
        }}</Button>
        <Button
          v-if="updates.available && updates.supported"
          :disabled="updates.busy"
          @click="updates.install()"
          >下载并安装</Button
        >
        <Button
          variant="outline"
          as="a"
          :href="releasePage"
          target="_blank"
          rel="noopener noreferrer"
          @click="handleExternalLinkClick($event, releasePage)"
          >打开下载发布页</Button
        >
      </div>
    </section>
  </div>
</template>
<script setup>
import { Button } from '../components/ui/button'
import { useUpdateStore } from '../stores/updateStore'
import { version } from '../../package.json'
import { handleExternalLinkClick } from '../utils/desktopBridge'
const updates = useUpdateStore()
const releasePage = 'https://github.com/CrissMagic/FMO-Dashboard/releases/latest'
</script>
<style scoped>
.update-view {
  height: 100%;
  overflow: auto;
  padding: 24px;
}
.update-card {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-panel);
}
h1 {
  font-size: 24px;
  margin: 0 0 16px;
}
p {
  line-height: 1.6;
}
.update-notes {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  max-height: 40vh;
  overflow-y: auto;
  background: var(--bg-page);
  padding: 16px;
  border-radius: 8px;
}
.update-hint {
  color: var(--text-secondary);
  font-size: 13px;
}
.update-error {
  color: color-mix(in srgb, var(--color-danger) 45%, var(--text-primary));
}
.update-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}
progress {
  width: 100%;
  accent-color: var(--color-primary);
}
</style>
