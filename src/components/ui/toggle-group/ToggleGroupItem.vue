<script setup lang="ts">
import type { VariantProps } from 'class-variance-authority'
import type { ToggleGroupItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from '@/lib/utils'
import { ToggleGroupItem, useForwardProps } from 'reka-ui'
import { inject } from 'vue'
import { toggleVariants } from '@/components/ui/toggle'

type ToggleGroupVariants = VariantProps<typeof toggleVariants> & {
  spacing?: number
}

const props = defineProps<
  ToggleGroupItemProps & {
    class?: HTMLAttributes['class']
    variant?: ToggleGroupVariants['variant']
    size?: ToggleGroupVariants['size']
  }
>()

const context = inject<ToggleGroupVariants>('toggleGroup')

const delegatedProps = reactiveOmit(props, 'class', 'size', 'variant')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ToggleGroupItem
    v-slot="slotProps"
    data-slot="toggle-group-item"
    :data-variant="context?.variant || variant"
    :data-size="context?.size || size"
    :data-spacing="context?.spacing"
    v-bind="forwardedProps"
    :class="
      cn(
        toggleVariants({
          variant: context?.variant || variant,
          size: context?.size || size
        }),
        'tw:w-auto tw:min-w-0 tw:shrink-0 tw:px-3 tw:focus:z-10 tw:focus-visible:z-10',
        'tw:data-[spacing=0]:rounded-none tw:data-[spacing=0]:shadow-none tw:data-[spacing=0]:first:rounded-l-md tw:data-[spacing=0]:last:rounded-r-md tw:data-[spacing=0]:data-[variant=outline]:border-l-0 tw:data-[spacing=0]:data-[variant=outline]:first:border-l',
        props.class
      )
    "
  >
    <slot v-bind="slotProps" />
  </ToggleGroupItem>
</template>
