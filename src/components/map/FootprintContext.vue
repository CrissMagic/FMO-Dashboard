<template>
  <section class="footprint-context" aria-label="地域与通联记录">
    <header class="context-heading">
      <button
        v-if="selected || following || allRecords"
        class="context-back"
        type="button"
        @click="emit('back')"
      >
        ← {{ following ? '返回足迹' : '已点亮地域' }}
      </button>
      <div>
        <h2>
          {{
            following
              ? speaker?.callsign
              : selected?.name ||
                (allRecords ? '全部通联' : scopeName ? `${scopeName} · 已点亮城市` : '已点亮地域')
          }}
        </h2>
        <span>{{
          following
            ? '友台位置'
            : selected
              ? selected.records.length
                ? '已点亮'
                : '尚未点亮'
              : allRecords
                ? `${records.length} 条记录`
                : `${timeline.length} 个地域`
        }}</span>
      </div>
    </header>
    <div v-if="following && speaker" class="region-summary">
      <p>
        {{ speaker.sourceLabel }}<span v-if="speaker.grid"> · {{ speaker.grid }}</span>
      </p>
      <p>{{ distance || '位置不足，暂不计算距离' }}</p>
    </div>
    <div v-else-if="selected" class="region-summary">
      <div v-if="selected.records.length" class="first-last">
        <div>
          <span>首次通联</span><strong>{{ date(first?.timestamp) }}</strong
          ><small>{{ first?.callsign }}</small>
        </div>
        <div>
          <span>最近通联</span><strong>{{ date(latest?.timestamp) }}</strong
          ><small>{{ latest?.callsign }}</small>
        </div>
      </div>
      <p v-else>尚无可确认归属到这里的通联记录。</p>
      <div class="region-counts">
        <span>{{ selected.records.length }} 条通联</span
        ><span>{{ new Set(selected.records.map((r) => r.callsign)).size }} 个友台</span>
      </div>
      <div v-if="miniCells.length" class="mini-grid" aria-label="附近网格">
        <button
          v-for="cell in miniCells"
          :key="cell.grid"
          type="button"
          :class="{ lit: cell.lit, selected: cell.selected }"
          @click="emit('grid', cell.grid)"
        >
          {{ cell.grid }}
        </button>
      </div>
      <button
        v-if="mode === 'area' && level === 'province'"
        class="text-action"
        type="button"
        @click="emit('province', selected.feature?.properties.adcode)"
      >
        查看城市足迹 →
      </button>
    </div>
    <template v-if="selected || following || allRecords">
      <div class="list-label">
        <span>通联记录</span><span>{{ periodLabel }} · {{ records.length }} 条</span>
      </div>
      <div
        v-if="records.length"
        class="context-list record-list"
        tabindex="0"
        aria-label="地域关联通联"
      >
        <article v-for="record in records.slice(0, limit)" :key="record.id">
          <div class="record-top">
            <button class="callsign-link" type="button" @click="emit('contact', record)">
              {{ record.callsign }}</button
            ><time
              >{{ date(record.timestamp) }}<small>{{ clock(record.timestamp) }}</small></time
            >
          </div>
          <div class="record-position">
            <button v-if="record.grid" type="button" @click="emit('grid', record.grid)">
              {{ record.grid }}</button
            ><span v-else>位置未提供</span
            ><span>{{
              record.source === 'coordinates'
                ? '通联坐标'
                : record.grid
                  ? `${record.grid.length} 位网格`
                  : '地域待确认'
            }}</span>
          </div>
          <p>
            {{ record.relayName || '中继未记录' }}<small> · {{ record.mode || 'FMO' }}</small>
          </p>
        </article>
        <button v-if="records.length > limit" class="load-more" type="button" @click="emit('more')">
          加载更多记录
        </button>
      </div>
      <div v-else class="context-empty">
        <p>{{ selected ? '该地域在所选时间内没有通联记录。' : '当前时间范围内暂无通联记录。' }}</p>
      </div>
    </template>
    <template v-else>
      <label class="context-search"
        ><span class="sr-only">搜索点亮地域</span
        ><input
          :value="search"
          :placeholder="mode === 'area' ? '搜索地域' : '搜索网格'"
          aria-label="搜索点亮地域"
          @input="emit('update:search', $event.target.value)"
      /></label>
      <div
        v-if="timeline.length"
        class="context-list region-list"
        tabindex="0"
        aria-label="已点亮地域列表"
      >
        <button
          v-for="area in timeline.slice(0, 80)"
          :key="area.id"
          type="button"
          @click="emit('select', area.id)"
        >
          <span class="region-dot" /><span class="region-name"
            ><strong>{{ area.name }}</strong
            ><small>首次 {{ date(area.first.timestamp) }} · {{ area.first.callsign }}</small></span
          ><span class="region-times">{{ area.records.length }} 次 <i>›</i></span>
        </button>
      </div>
      <div v-else class="context-empty">
        <strong>{{
          loading ? '正在读取足迹' : search ? '未找到匹配地域' : '等待第一块地域点亮'
        }}</strong>
        <p>
          {{ search ? '试试其他地域名称或网格。' : '有位置的通联记录同步后，会自动点亮对应地域。' }}
        </p>
        <button v-if="!loading && !search" class="text-action" type="button" @click="emit('logs')">
          前往通联日志 →
        </button>
      </div>
    </template>
    <footer>
      <button v-if="!allRecords || selected || following" type="button" @click="emit('all')">
        全部通联记录 <span>{{ total }} 条 →</span></button
      ><span v-else>位置以通联当时的记录为准</span
      ><small v-if="timeline.length > 80 && !allRecords && !selected"
        >显示前 80 个地域，可搜索其余地域</small
      >
    </footer>
  </section>
</template>

<script setup>
defineProps({
  selected: { type: Object, default: null },
  following: Boolean,
  speaker: { type: Object, default: null },
  distance: { type: String, default: '' },
  timeline: { type: Array, default: () => [] },
  records: { type: Array, default: () => [] },
  first: { type: Object, default: null },
  latest: { type: Object, default: null },
  miniCells: { type: Array, default: () => [] },
  search: { type: String, default: '' },
  mode: { type: String, default: 'area' },
  level: { type: String, default: 'province' },
  scopeName: { type: String, default: '' },
  periodLabel: { type: String, default: '全部时间' },
  allRecords: Boolean,
  total: { type: Number, default: 0 },
  limit: { type: Number, default: 30 },
  loading: Boolean
})
const emit = defineEmits([
  'back',
  'select',
  'grid',
  'province',
  'contact',
  'more',
  'all',
  'logs',
  'update:search'
])
function date(timestamp) {
  return timestamp
    ? new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : '—'
}
function clock(timestamp) {
  return timestamp
    ? new Date(timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : ''
}
</script>

<style scoped>
.footprint-context {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--bg-card);
  color: var(--text-primary);
}
.context-heading {
  padding: 20px 20px 15px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-secondary);
}
.context-heading > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.context-heading h2 {
  font-size: 17px;
  line-height: 1.5;
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.context-heading > div > span {
  font-size: 12px;
  white-space: nowrap;
  color: var(--text-tertiary);
}
.context-back {
  margin-bottom: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.region-summary {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-secondary);
  max-height: 260px;
  overflow: auto;
  flex-shrink: 0;
}
.region-summary p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 7px;
}
.first-last {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.first-last > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.first-last span {
  font-size: 12px;
  color: var(--text-tertiary);
}
.first-last strong {
  font-size: 13px;
  font-weight: 550;
}
.first-last small {
  font-size: 12px;
  color: var(--text-secondary);
}
.region-counts {
  display: flex;
  gap: 15px;
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-secondary);
}
.text-action {
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  font-size: 13px;
  padding: 10px 0 0;
  cursor: pointer;
}
.mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin: 14px 0 3px;
}
.mini-grid button {
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  background: var(--bg-table-header);
  font: inherit;
  font-size: 11px;
  padding: 5px;
  color: var(--text-secondary);
  cursor: pointer;
}
.mini-grid button.lit {
  color: var(--color-primary);
  background: var(--surface-accent);
}
.mini-grid button.selected {
  border-color: var(--color-primary);
}
.context-search {
  display: block;
  padding: 14px 18px;
  flex-shrink: 0;
}
.context-search input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  padding: 9px 11px;
  background: var(--bg-table-header);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.context-search input:focus {
  border-color: var(--color-primary);
}
.context-search input::placeholder {
  color: var(--text-tertiary);
}
.context-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}
.region-list {
  padding: 0 18px;
}
.region-list > button {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 11px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--border-secondary);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  padding: 16px 0;
  cursor: pointer;
}
.region-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
  flex-shrink: 0;
}
.region-name {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}
.region-name strong {
  font-size: 14px;
  font-weight: 550;
}
.region-name small {
  font-size: 11px;
  color: var(--text-tertiary);
}
.region-times {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.region-times i {
  font-size: 18px;
  font-style: normal;
  margin-left: 5px;
  color: var(--text-tertiary);
}
.region-list > button:hover .region-name strong {
  color: var(--color-primary);
}
.list-label {
  display: flex;
  justify-content: space-between;
  padding: 13px 20px 7px;
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.record-list {
  padding: 0 20px;
}
.record-list article {
  padding: 15px 0;
  border-bottom: 1px solid var(--border-secondary);
}
.record-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.callsign-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.record-top time {
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: right;
}
.record-top small {
  display: block;
  margin-top: 3px;
}
.record-position {
  display: flex;
  gap: 9px;
  margin-top: 9px;
  align-items: center;
  font-size: 12px;
  color: var(--text-tertiary);
}
.record-position button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.record-list p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  margin: 7px 0 0;
}
.record-list p small {
  font-size: 11px;
  color: var(--text-tertiary);
}
.context-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 25px;
  text-align: center;
  overflow: auto;
}
.context-empty strong {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}
.context-empty p {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-tertiary);
}
.load-more {
  display: block;
  margin: 15px auto;
  border: 1px solid var(--border-secondary);
  border-radius: 5px;
  background: transparent;
  color: var(--color-primary);
  padding: 7px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border-secondary);
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
footer button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}
footer button span {
  color: var(--color-primary);
}
footer small {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.6;
}
.sr-only {
  position: absolute;
  clip: rect(0, 0, 0, 0);
  width: 1px;
  height: 1px;
  overflow: hidden;
}
button:focus-visible,
[tabindex='0']:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
button {
  transition:
    color 0.15s,
    background-color 0.15s;
}
@media (max-width: 768px) {
  .context-heading {
    padding: 16px 20px;
  }
  .context-search input {
    font-size: 16px;
  }
  .region-name strong {
    font-size: 15px;
  }
  .region-name small,
  .record-top time {
    font-size: 12px;
  }
  .record-list p {
    font-size: 13px;
  }
  .record-position {
    font-size: 13px;
  }
  .region-list > button {
    padding: 17px 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
</style>
