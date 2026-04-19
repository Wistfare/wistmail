import Image from 'next/image'
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

const sizePx = {
  sm: 24,
  md: 32,
  lg: 40,
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name)
  const bgColor = stringToColor(name)

  if (src) {
    const px = sizePx[size]
    return (
      <Image
        src={src}
        alt={name}
        width={px}
        height={px}
        // 2x retina source: deviceSizes config in next.config picks the
        // closest, then we render at the CSS size. quality 70 is plenty
        // for avatar-scale crops and shaves bytes vs the default 75.
        quality={70}
        loading="lazy"
        unoptimized={src.startsWith('data:')}
        className={cn(
          'rounded-full object-cover',
          sizeStyles[size],
          className,
        )}
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
