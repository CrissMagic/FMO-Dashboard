<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child
      ><Button variant="link" size="sm" :title="title" :disabled="busy"
        >最近中继 <ChevronDown :size="14" aria-hidden="true" /></Button
    ></DialogTrigger>
    <DialogContent class="tw:max-w-[390px]">
      <DialogHeader
        ><DialogTitle>最近活跃中继</DialogTitle
        ><DialogDescription>在最近发言出现的中继之间切换。</DialogDescription></DialogHeader
      >
      <div class="tw:flex tw:gap-3">
        <Button variant="outline" :disabled="busy" @click="emit('previous')">上个活跃中继</Button
        ><Button variant="outline" :disabled="busy" @click="emit('next')">下个活跃中继</Button>
      </div>
      <DialogFooter
        ><DialogClose as-child><Button variant="secondary">关闭</Button></DialogClose></DialogFooter
      >
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog'
defineProps<{ title: string; busy: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits(['previous', 'next'])
</script>
