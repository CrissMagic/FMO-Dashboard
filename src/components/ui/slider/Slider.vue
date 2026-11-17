<script setup lang="ts">
import type { SliderRootEmits, SliderRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from '@/lib/utils'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<SliderRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SliderRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SliderRoot
    v-slot="{ modelValue }"
    data-slot="slider"
    :class="
      cn(
        'tw:relative tw:flex tw:w-full tw:touch-none tw:items-center tw:select-none tw:data-[disabled]:opacity-50 tw:data-[orientation=horizontal]:min-h-11 tw:data-[orientation=vertical]:h-full tw:data-[orientation=vertical]:min-h-44 tw:data-[orientation=vertical]:w-auto tw:data-[orientation=vertical]:flex-col',
        props.class
      )
    "
    v-bind="forwarded"
  >
    <SliderTrack
      data-slot="slider-track"
      class="tw:bg-input tw:relative tw:grow tw:overflow-hidden tw:rounded-full tw:data-[orientation=horizontal]:h-1.5 tw:data-[orientation=horizontal]:w-full tw:data-[orientation=vertical]:h-full tw:data-[orientation=vertical]:w-1.5"
    >
      <SliderRange
        data-slot="slider-range"
        class="tw:bg-primary tw:absolute tw:data-[orientation=horizontal]:h-full tw:data-[orientation=vertical]:w-full"
      />
    </SliderTrack>

    <SliderThumb
      v-for="(_, key) in modelValue"
      :key="key"
      data-slot="slider-thumb"
      class="tw:bg-white tw:border-primary tw:ring-ring/50 tw:block tw:size-4 tw:shrink-0 tw:rounded-full tw:border tw:shadow-sm tw:transition-[color,box-shadow] tw:hover:ring-4 tw:focus-visible:ring-4 tw:focus-visible:outline-hidden tw:disabled:pointer-events-none tw:disabled:opacity-50"
    />
  </SliderRoot>
</template>
