import { cn, getInitials, stringToColor } from '@/lib/utils'

export interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeStyles = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name)
  const bgColor = stringToColor(name)

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizeStyles[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full font-semibold text-white',
        sizeStyles[size],
        className,
      )}
      style={{ backgroundColor: bgColor }}
      title={name}
    >
      {initials}
    </div>
  )
}
