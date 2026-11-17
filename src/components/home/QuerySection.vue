<template>
  <div v-if="hasFilters" class="query-section">
    <div class="filter-controls">
      <div v-if="currentQueryType === 'oldFriends' && totalCount > 0" class="stats-label">
        <svg
          class="stats-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        {{ t('query.oldFriendCount', `老友数：${totalCount}`, { count: totalCount }) }}
      </div>
      <div v-if="currentQueryType === 'all'" class="search-box">
        <svg
          class="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <CallsignInput
          id="search-keyword"
          :aria-label="t('query.targetCallsign', '对方呼号')"
          :model-value="searchKeyword"
          :placeholder="t('query.targetCallsign', '对方呼号')"
          :disabled="!dbLoaded"
          @update:model-value="$emit('update:searchKeyword', $event)"
        />
      </div>
      <div v-if="currentQueryType === 'all'" class="date-filter">
        <DatePicker
          :model-value="filterDate"
          :from-callsign="fromCallsign"
          :placeholder="t('common.filterDate', '筛选日期')"
          @update:model-value="$emit('update:filterDate', $event)"
        />
      </div>
      <div v-if="currentQueryType === 'all'" class="quick-filters">
        <Button
          :variant="activeQuickFilter === 'today' ? 'default' : 'outline'"
          size="sm"
          class="quick-filter-chip"
          :class="{ active: activeQuickFilter === 'today' }"
          :disabled="!dbLoaded"
          @click="$emit('quickFilter', 'today')"
        >
          {{ t('common.today', '今日') }}
        </Button>
        <Button
          :variant="activeQuickFilter === 'week' ? 'default' : 'outline'"
          size="sm"
          class="quick-filter-chip"
          :class="{ active: activeQuickFilter === 'week' }"
          :disabled="!dbLoaded"
          @click="$emit('quickFilter', 'week')"
        >
          {{ t('common.thisWeek', '本周') }}
        </Button>
        <Button
          :variant="activeQuickFilter === 'month' ? 'default' : 'outline'"
          size="sm"
          class="quick-filter-chip"
          :class="{ active: activeQuickFilter === 'month' }"
          :disabled="!dbLoaded"
          @click="$emit('quickFilter', 'month')"
        >
          {{ t('common.thisMonth', '本月') }}
        </Button>
      </div>
      <div v-if="currentQueryType === 'oldFriends'" class="search-box">
        <svg
          class="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <CallsignInput
          id="old-friends-search"
          :model-value="oldFriendsSearchKeyword"
          :placeholder="t('common.searchCallsign', '搜索呼号')"
          :disabled="!dbLoaded"
          @update:model-value="$emit('update:oldFriendsSearchKeyword', $event)"
        />
      </div>
      <div
        v-if="currentQueryType === 'oldFriends' && totalCount > 0"
        class="prioritize-chip-wrapper"
      >
        <Button
          :variant="prioritizeToday ? 'default' : 'outline'"
          size="sm"
          class="prioritize-chip"
          :class="{ active: prioritizeToday }"
          :disabled="!dbLoaded"
          @click="togglePrioritizeToday"
        >
          <svg
            class="sort-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="14" y2="12" />
            <line x1="4" y1="18" x2="8" y2="18" />
          </svg>
          {{ t('query.todayContacted', '今日已通联') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Button } from '../ui/button'

import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../../stores/settingsStore'
import DatePicker from '../common/DatePicker.vue'
import CallsignInput from '../common/CallsignInput.vue'
import { useLocale } from '../../composables/useLocale'

const props = defineProps({
  currentQueryType: {
    type: String,
    required: true
  },
  searchKeyword: {
    type: String,
    default: ''
  },
  oldFriendsSearchKeyword: {
    type: String,
    default: ''
  },
  filterDate: {
    type: String,
    default: null
  },
  fromCallsign: {
    type: String,
    default: null
  },
  dbLoaded: {
    type: Boolean,
    default: false
  },
  totalCount: {
    type: Number,
    default: 0
  },
  activeQuickFilter: {
    type: String,
    default: ''
  }
})

defineEmits([
  'update:searchKeyword',
  'update:oldFriendsSearchKeyword',
  'update:filterDate',
  'quickFilter'
])

const settingsStore = useSettingsStore()
const { prioritizeToday } = storeToRefs(settingsStore)
const { t } = useLocale()

function togglePrioritizeToday() {
  settingsStore.setPrioritizeToday(!prioritizeToday.value)
}

const hasFilters = computed(() => {
  return props.currentQueryType === 'all' || props.currentQueryType === 'oldFriends'
})
</script>

<style scoped>
.query-section {
  margin-bottom: 0;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  padding: 0.65rem 0.9rem;
  margin-top: 0.5rem;
}

.filter-controls {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.stats-label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  white-space: nowrap;
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.stats-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.search-box {
  display: flex;
  align-items: center;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 0.55rem;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  pointer-events: none;
  z-index: 1;
}

.search-box :deep(input) {
  padding-left: 1.8rem;
  width: 135px;
}

.date-filter {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.quick-filters {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.prioritize-chip-wrapper {
  display: flex;
  align-items: center;
}

.prioritize-chip .sort-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .query-section {
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
    margin-top: 0.25rem;
  }

  .filter-controls {
    gap: 0.5rem;
  }

  .quick-filters {
    display: none;
  }

  .search-box {
    flex: 1;
    min-width: 0;
  }

  .search-box :deep(input) {
    width: 100%;
    font-size: 1rem;
  }

  .date-filter {
    flex: 1;
    min-width: 0;
  }
}

@media (max-width: 360px) {
  .query-section {
    margin-top: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
    padding: 0.4rem 0.5rem;
  }

  .filter-controls {
    width: 100%;
    gap: 0.4rem;
    flex-direction: column;
    align-items: stretch;
  }

  .search-box,
  .date-filter {
    width: 100%;
    flex: none;
  }

  .search-box :deep(input) {
    width: 100%;
  }
}
</style>

<style>
/* 移动端（≤768px）：强制日期选择器撑满 .date-filter 宽度 */
@media (max-width: 768px) {
  .query-section .date-filter .date-picker {
    display: flex;
    width: 100%;
  }

  .query-section .date-filter .date-picker-trigger {
    flex: 1;
  }
}
</style>
