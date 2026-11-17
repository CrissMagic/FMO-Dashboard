import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Toggle } from './Toggle.vue'

export const toggleVariants = cva(
  "tw:inline-flex tw:items-center tw:justify-center tw:gap-2 tw:rounded-md tw:text-sm tw:font-medium tw:hover:bg-muted tw:hover:text-muted-foreground tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:data-[state=on]:bg-accent tw:data-[state=on]:text-accent-foreground tw:[&_svg]:pointer-events-none tw:[&_svg:not([class*='size-'])]:size-4 tw:[&_svg]:shrink-0 tw:focus-visible:border-ring tw:focus-visible:ring-ring/50 tw:focus-visible:ring-3 tw:outline-none tw:transition-[color,box-shadow] tw:aria-invalid:ring-destructive/20 tw:dark:aria-invalid:ring-destructive/40 tw:aria-invalid:border-destructive tw:whitespace-nowrap",
  {
    variants: {
      variant: {
        default: 'tw:bg-transparent',
        outline:
          'tw:border tw:border-input tw:bg-transparent tw:shadow-xs tw:hover:bg-accent tw:hover:text-accent-foreground'
      },
      size: {
        default: 'tw:h-9 tw:px-2 tw:min-w-9',
        sm: 'tw:h-8 tw:px-1.5 tw:min-w-8',
        lg: 'tw:h-10 tw:px-2.5 tw:min-w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export type ToggleVariants = VariantProps<typeof toggleVariants>
