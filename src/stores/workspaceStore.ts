import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useWorkspaceStore = defineStore('workspace', () => {
  const lastView = ref<'live' | 'footprints'>('live')
  const target = computed(() =>
    lastView.value === 'footprints' ? '/dashboard?view=footprints' : '/dashboard'
  )
  function remember(view: 'live' | 'footprints') {
    lastView.value = view
  }
  return { lastView, target, remember }
})
