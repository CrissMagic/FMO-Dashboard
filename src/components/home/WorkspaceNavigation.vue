<template>
  <nav
    class="workspace-navigation"
    :class="{ 'bottom-navigation': bottom, 'with-tabs': workspace }"
    :aria-label="bottom ? '底部导航' : '主导航'"
  >
    <div v-if="workspace" class="view-tabs" role="tablist" aria-label="仪表盘展示">
      <span
        class="view-indicator"
        aria-hidden="true"
        :style="{ transform: `translateX(${active(viewItems[1]) ? '100%' : '0'})` }"
      />
      <button
        v-for="item in viewItems"
        :id="tabId(item)"
        :key="item.type"
        role="tab"
        type="button"
        :aria-selected="active(item)"
        :aria-controls="item.type === 'map' ? 'dashboard-footprints-panel' : 'dashboard-live-panel'"
        :tabindex="active(item) ? 0 : -1"
        @click="router.push(item.path)"
        @keydown="handleTabKeydown($event, item)"
      >
        <SvgIcon :name="item.icon" :size="16" />{{ label(item) }}
      </button>
    </div>
    <router-link
      v-for="item in linkItems"
      :key="item.type"
      v-slot="{ href, navigate }"
      :to="bottom && item.type === 'dashboard' ? workspaceStore.target : item.path"
      custom
    >
      <a
        :href="href"
        :class="{ active: active(item) }"
        :aria-current="active(item) ? 'page' : undefined"
        @click="navigate"
      >
        <SvgIcon :name="item.icon" :size="bottom ? 22 : 16" />
        <span>{{ label(item) }}</span>
        <i v-if="item.type === 'messages' && hasUnreadMessages" class="unread-dot" />
      </a>
    </router-link>
  </nav>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SvgIcon from '../common/SvgIcon.vue'
import { NAV_ROUTES, MORE_ROUTES } from './constants'
import { dashboardView, isNavigationActive } from '../../core/navigation'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useLocale } from '../../composables/useLocale'

const props = defineProps({
  workspace: { type: Boolean, default: false },
  bottom: { type: Boolean, default: false },
  hasUnreadMessages: { type: Boolean, default: false }
})
const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
watch(
  () => [route.name, route.query.view],
  () => {
    if (route.name === 'dashboard') workspaceStore.remember(dashboardView(route.query))
  },
  { immediate: true }
)
const { t, isEnglish } = useLocale()
const viewItems = NAV_ROUTES.filter((item) => ['dashboard', 'map'].includes(item.type))
const linkItems = computed(() =>
  props.bottom
    ? NAV_ROUTES.filter((item) => item.type !== 'map')
    : props.workspace
      ? NAV_ROUTES.filter((item) => !viewItems.includes(item))
      : NAV_ROUTES
)
const active = (item) =>
  props.bottom && item.type === 'dashboard'
    ? route.name === 'dashboard'
    : item.type === 'more' && MORE_ROUTES.some((child) => child.type === route.name)
      ? true
      : isNavigationActive(route, item)
const label = (item) => (isEnglish.value ? t(`nav.${item.type}`, item.label) : item.label)
const tabId = (item) => (item.type === 'map' ? 'dashboard-footprints-tab' : 'dashboard-live-tab')
function handleTabKeydown(event, item) {
  let index = viewItems.indexOf(item)
  if (event.key === 'ArrowRight') index = (index + 1) % viewItems.length
  else if (event.key === 'ArrowLeft') index = (index - 1 + viewItems.length) % viewItems.length
  else if (event.key === 'Home') index = 0
  else if (event.key === 'End') index = viewItems.length - 1
  else return
  event.preventDefault()
  router.push(viewItems[index].path)
  event.currentTarget.parentElement.querySelector(`#${tabId(viewItems[index])}`)?.focus()
}
</script>

<style scoped>
.workspace-navigation {
  display: flex;
  align-items: center;
  gap: 8px 22px;
  min-width: 0;
  flex-shrink: 0;
  padding: 0 22px;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--bg-card);
  height: 50px;
}
.view-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 240px;
  position: relative;
  align-self: stretch;
  margin-right: auto;
  gap: 0;
}
.view-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 50%;
  background: var(--color-primary);
  transition: transform 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
}
a,
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  position: relative;
  border: 0;
  padding: 8px 3px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s;
}
.view-tabs button {
  font-size: 14px;
  padding-inline: 14px;
}
.view-tabs button[aria-selected='true'],
a.active {
  color: var(--color-primary);
  font-weight: 600;
}
.workspace-navigation:not(.with-tabs):not(.bottom-navigation) > a:nth-of-type(3) {
  margin-left: auto;
}
a:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 3px;
}
.unread-dot {
  position: absolute;
  top: 4px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-danger);
}
.bottom-navigation {
  display: none;
}
@media (max-width: 768px) {
  .workspace-navigation:not(.with-tabs):not(.bottom-navigation),
  .with-tabs > a {
    display: none;
  }
  .with-tabs {
    height: 44px;
    padding: 0 12px;
  }
  .view-tabs {
    width: 100%;
    margin: 0;
  }
  .view-tabs button {
    font-size: 14px;
  }
  .bottom-navigation {
    display: flex;
    justify-content: space-around;
    gap: 0;
    height: auto;
    padding: 5px 0 calc(5px + var(--safe-inset-bottom, env(safe-area-inset-bottom, 0px)));
    border-top: 1px solid var(--border-secondary);
    border-bottom: 0;
    background: var(--bg-card);
    z-index: 200;
  }
  .bottom-navigation a {
    flex: 1;
    flex-direction: column;
    gap: 3px;
    padding: 4px 0;
    font-size: 11px;
  }
  .bottom-navigation a.active {
    background: transparent;
  }
  .bottom-navigation .unread-dot {
    right: calc(50% - 18px);
    top: 2px;
  }
}
@media (prefers-reduced-motion: reduce) {
  a,
  button,
  .view-indicator {
    transition: none;
  }
}
</style>
