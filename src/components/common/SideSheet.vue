<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        class="sheet-overlay"
        @click.self="emit('close')"
        @keydown.esc.stop.prevent="emit('close')"
      >
        <section
          ref="panel"
          class="sheet-panel"
          :class="placement"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          @keydown.tab="trapFocus"
        >
          <header>
            <h2>{{ title }}</h2>
            <button type="button" :aria-label="`关闭${title}`" @click="emit('close')">×</button>
          </header>
          <div class="sheet-body"><slot /></div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps({
  open: Boolean,
  title: { type: String, required: true },
  placement: { type: String, default: 'right' }
})
const emit = defineEmits(['close'])
const panel = ref(null)
let previousFocus = null
let previousInert = false
let locked = false
function restore() {
  if (!locked) return
  const app = document.getElementById('app')
  if (app) app.inert = previousInert
  locked = false
  if (previousFocus?.isConnected) previousFocus.focus()
}
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      restore()
      return
    }
    previousFocus = document.activeElement
    const app = document.getElementById('app')
    previousInert = app?.inert || false
    if (app) app.inert = true
    locked = true
    await nextTick()
    panel.value?.querySelector('button')?.focus()
  },
  { immediate: true }
)
function trapFocus(event) {
  const elements = [
    ...panel.value.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')
  ].filter((el) => !el.disabled && el.getClientRects().length)
  if (!elements.length) {
    event.preventDefault()
    panel.value.focus()
    return
  }
  const first = elements[0],
    last = elements[elements.length - 1]
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel.value)
  ) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
onBeforeUnmount(restore)
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 15000;
  display: flex;
  justify-content: flex-end;
  background: var(--overlay-bg);
}
.sheet-panel {
  width: min(460px, 100%);
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-card);
  box-shadow: -12px 0 48px var(--shadow-modal);
  outline: 0;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  color: var(--text-primary);
}
header button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 6px;
  color: var(--text-secondary);
  background: var(--bg-table-header);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.sheet-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 22px;
  color: var(--text-primary);
}
.sheet-panel.bottom {
  width: 100%;
  height: min(82dvh, 740px);
  border-radius: 18px 18px 0 0;
  align-self: flex-end;
}
.sheet-panel.bottom .sheet-body {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: background-color 0.2s;
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  background: transparent;
}
.sheet-enter-from .right,
.sheet-leave-to .right {
  transform: translateX(100%);
}
.sheet-enter-from .bottom,
.sheet-leave-to .bottom {
  transform: translateY(100%);
}
@media (max-width: 768px) {
  .sheet-panel.right {
    width: 100%;
  }
  header {
    padding: 16px 18px;
  }
  .sheet-body {
    padding: 18px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .sheet-enter-active .sheet-panel,
  .sheet-leave-active .sheet-panel {
    transition: none;
  }
}
</style>
