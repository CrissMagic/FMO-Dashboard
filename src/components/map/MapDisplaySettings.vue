<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="map" class="map-settings-trigger" aria-label="地图显示设置">
        <SvgIcon name="settings" :size="16" />地图显示
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      side="top"
      :side-offset="10"
      :collision-padding="12"
      class="map-display-popover"
      aria-labelledby="map-display-title"
    >
      <div class="map-settings-body">
        <div class="map-settings-title">
          <h2 id="map-display-title">地图显示</h2>
          <p>设置即时生效，并在下次打开时保留。</p>
        </div>
        <section class="map-setting-section" aria-labelledby="position-format-label">
          <Label id="position-format-label">位置标注</Label>
          <ToggleGroup
            type="single"
            :spacing="1"
            variant="outline"
            :model-value="preferences.format"
            aria-label="位置标注格式"
            class="map-format-options"
            @update:model-value="setFormat"
          >
            <ToggleGroupItem value="coordinates" aria-label="经纬度">经纬度</ToggleGroupItem>
            <ToggleGroupItem value="maidenhead" aria-label="梅登黑德">梅登黑德</ToggleGroupItem>
          </ToggleGroup>
          <p>经纬度使用 WGS84；网格位置仍按原始精度标注。</p>
        </section>
        <section class="map-setting-section">
          <div class="map-setting-switch">
            <div>
              <Label for="detailed-map-switch">详细底图</Label>
              <p>显示道路、街道与详细地名</p>
            </div>
            <Switch
              id="detailed-map-switch"
              :model-value="preferences.background === 'detailed'"
              @update:model-value="toggleDetailed"
            />
          </div>
          <div v-if="preferences.background !== 'detailed'" class="map-setting-field">
            <Label for="plain-map-mode">基础底图</Label>
            <Select
              :model-value="preferences.background"
              @update:model-value="
                (value) => display.update({ background: String(value) as 'simple' | 'none' })
              "
            >
              <SelectTrigger id="plain-map-mode" aria-label="基础底图"
                ><SelectValue
              /></SelectTrigger>
              <SelectContent
                ><SelectItem value="simple">简洁 · 省级行政区</SelectItem
                ><SelectItem value="none">无底图 · 仅位置与连线</SelectItem></SelectContent
              >
            </Select>
          </div>
        </section>
        <section class="map-setting-section">
          <div class="map-setting-switch">
            <div>
              <Label for="map-grid-switch">网格线</Label>
              <p>叠加经纬网或梅登黑德网格</p>
            </div>
            <Switch
              id="map-grid-switch"
              :model-value="preferences.grid !== 'none'"
              @update:model-value="toggleGrid"
            />
          </div>
          <div v-if="preferences.grid !== 'none'" class="map-setting-field">
            <Label for="map-grid-mode">网格类型</Label>
            <Select
              :model-value="preferences.grid"
              @update:model-value="
                (value) => display.update({ grid: String(value) as 'coordinates' | 'maidenhead' })
              "
            >
              <SelectTrigger id="map-grid-mode" aria-label="网格类型"
                ><SelectValue
              /></SelectTrigger>
              <SelectContent
                ><SelectItem value="coordinates">经纬网</SelectItem
                ><SelectItem value="maidenhead">梅登黑德网格</SelectItem></SelectContent
              >
            </Select>
          </div>
          <div v-if="preferences.grid === 'maidenhead'" class="map-setting-field">
            <Label for="map-grid-precision">网格精度</Label>
            <Select :model-value="String(preferences.precision)" @update:model-value="setPrecision">
              <SelectTrigger id="map-grid-precision" aria-label="网格精度"
                ><SelectValue
              /></SelectTrigger>
              <SelectContent
                ><SelectItem value="auto">自动 · 随缩放调整</SelectItem
                ><SelectItem value="4">4 位网格</SelectItem
                ><SelectItem value="6">6 位网格</SelectItem
                ><SelectItem value="8">8 位网格</SelectItem></SelectContent
              >
            </Select>
          </div>
        </section>
      </div>
      <p v-if="display.persistenceError" class="map-settings-error" role="alert">
        {{ display.persistenceError
        }}<Button variant="link" size="sm" @click="display.update({})">重试保存</Button>
      </p>
      <Button variant="secondary" class="map-settings-done" @click="open = false">完成</Button>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMapDisplayStore } from '../../stores/mapDisplayStore'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Switch } from '../ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import SvgIcon from '../common/SvgIcon.vue'

const display = useMapDisplayStore()
const { preferences } = storeToRefs(display)
const open = ref(false)
const lastGrid = ref<'coordinates' | 'maidenhead'>('maidenhead')
const lastPlain = ref<'simple' | 'none'>('simple')
watch(
  () => preferences.value.grid,
  (grid) => {
    if (grid !== 'none') lastGrid.value = grid
  },
  { immediate: true }
)
watch(
  () => preferences.value.background,
  (background) => {
    if (background !== 'detailed') lastPlain.value = background
  },
  { immediate: true }
)
function toggleDetailed(value: boolean) {
  display.update({ background: value ? 'detailed' : lastPlain.value })
}
function toggleGrid(value: boolean) {
  display.update({ grid: value ? lastGrid.value : 'none' })
}
function setFormat(value: unknown) {
  if (value === 'coordinates' || value === 'maidenhead') display.update({ format: value })
}
function setPrecision(value: unknown) {
  display.update({ precision: value === 'auto' ? 'auto' : (Number(value) as 4 | 6 | 8) })
}
</script>

<style>
.map-display-popover {
  z-index: 2000;
  width: min(360px, calc(100vw - 24px));
  max-height: min(600px, 75dvh);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 20px;
  box-shadow: var(--shadow-panel);
}
.map-settings-body {
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
  margin: -2px;
}
.map-settings-trigger {
  min-height: 44px;
}
.map-settings-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.map-settings-title p,
.map-setting-section p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.map-setting-section {
  padding-block: 16px;
  border-bottom: 1px solid var(--border-secondary);
}
.map-setting-section [data-slot='label'] {
  font-size: 13px;
}
.map-setting-switch {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.map-setting-switch [data-slot='switch'] {
  flex-shrink: 0;
}
.map-format-options {
  display: flex;
  width: 100%;
  margin-top: 10px;
  gap: 6px;
}
.map-format-options > button {
  flex: 1;
  min-height: 40px;
}
.map-setting-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
.map-setting-field [data-slot='select-trigger'] {
  width: 100%;
  min-height: 40px;
}
.map-settings-error {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-warning);
}
.map-settings-done {
  flex-shrink: 0;
  width: 100%;
  margin-top: 16px;
  min-height: 40px;
}
</style>

<style>
@media (max-width: 639px) {
  .map-format-options > button,
  .map-setting-field [data-slot='select-trigger'] {
    min-height: 44px;
  }
}
</style>
