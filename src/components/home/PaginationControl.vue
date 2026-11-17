<template>
  <div v-if="totalPages >= 1" class="pagination">
    <Button
      variant="outline"
      size="icon"
      :disabled="disabled || currentPage === 1"
      class="page-btn nav-btn"
      aria-label="首页"
      @click="$emit('page-change', 1)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        width="14"
        height="14"
      >
        <polyline points="11 17 6 12 11 7" />
        <polyline points="18 17 13 12 18 7" />
      </svg>
    </Button>
    <Button
      variant="outline"
      size="icon"
      :disabled="disabled || currentPage === 1"
      class="page-btn"
      aria-label="上一页"
      @click="$emit('page-change', currentPage - 1)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        width="14"
        height="14"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </Button>
    <div class="page-info">
      <Input
        type="number"
        aria-label="跳转页码"
        class="page-jump-input"
        :model-value="currentPage"
        :min="1"
        :max="totalPages"
        :disabled="disabled"
        @change="handleJump"
        @focus="$event.target.select()"
      />
      <span class="page-sep">/</span>
      <span class="page-total">{{ totalPages }}</span>
      <template v-if="totalRecords !== undefined">
        <span class="page-total-records">{{
          t('common.totalRecords', `共 ${totalRecords} 条`, { count: totalRecords })
        }}</span>
      </template>
    </div>
    <Button
      variant="outline"
      size="icon"
      :disabled="disabled || currentPage === totalPages || totalPages === 0"
      class="page-btn"
      aria-label="下一页"
      @click="$emit('page-change', currentPage + 1)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        width="14"
        height="14"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Button>
    <Button
      variant="outline"
      size="icon"
      :disabled="disabled || currentPage === totalPages || totalPages === 0"
      class="page-btn nav-btn"
      aria-label="末页"
      @click="$emit('page-change', totalPages)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        width="14"
        height="14"
      >
        <polyline points="13 17 18 12 13 7" />
        <polyline points="6 17 11 12 6 7" />
      </svg>
    </Button>
  </div>
</template>

<script setup>
import { Button } from '../ui/button'
import { Input } from '../ui/input'

import { useLocale } from '../../composables/useLocale'

const props = defineProps({
  currentPage: {
    type: Number,
    required: true
  },
  totalPages: {
    type: Number,
    required: true
  },
  totalRecords: {
    type: Number,
    default: undefined
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['page-change'])
const { t } = useLocale()

function handleJump(event) {
  const val = parseInt(event.target.value, 10)
  if (!isNaN(val) && val >= 1 && val <= props.totalPages) {
    emit('page-change', val)
  } else {
    event.target.value = props.currentPage
  }
}
</script>

<style scoped>
.pagination {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.75rem 0;
  background: var(--bg-container);
  border-top: 1px solid var(--border-light);
  flex-wrap: nowrap;
  min-height: 50px;
}

.page-info {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin: 0 0.5rem;
  white-space: nowrap;
  flex-shrink: 0;
}

.page-jump-input {
  width: 50px;
  height: 40px;
  text-align: center;
  font-weight: 600;
  padding: 0 0.2rem;
  -moz-appearance: textfield;
  appearance: textfield;
}

.page-jump-input::-webkit-outer-spin-button,
.page-jump-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}

.page-jump-input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.page-sep {
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.page-total {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.9rem;
}

.page-total-records {
  color: var(--text-tertiary);
  font-size: 0.8rem;
  margin-left: 0.35rem;
}

@media (max-width: 768px) {
  .pagination {
    display: none;
  }

  .nav-btn {
    display: none;
  }
}

@media (max-width: 480px) {
  .page-info {
    font-size: 0.8rem;
    margin: 0 0.3rem;
  }

  .page-jump-input {
    width: 36px;
    height: 28px;
    font-size: 0.85rem;
  }

  .page-total-records {
    display: none;
  }
}
</style>
