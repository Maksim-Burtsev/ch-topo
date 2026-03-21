import { type VariantProps, cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        mergetree: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        summing: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        aggregating: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        replacing: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
        mv: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
        dictionary: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
        distributed: 'border-red-400/30 bg-red-400/10 text-red-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type BadgeVariant = VariantProps<typeof badgeVariants>['variant']

interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
