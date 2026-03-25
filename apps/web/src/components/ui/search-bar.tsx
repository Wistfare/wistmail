import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onSubmit?: () => void
  shortcutHint?: string
  className?: string
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, placeholder = 'Search...', onSubmit, shortcutHint, className }, ref) => {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 border border-wm-border bg-wm-surface px-4 py-2.5',
          'focus-within:border-wm-accent focus-within:ring-1 focus-within:ring-wm-accent/30',
          className,
        )}
      >
        <Search className="h-4 w-4 text-wm-text-muted" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
          placeholder={placeholder}
          className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
        />
        {value && (
          <button onClick={() => onChange('')} className="text-wm-text-muted hover:text-wm-text-secondary">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {shortcutHint && !value && (
          <kbd className="border border-wm-border px-1.5 py-0.5 font-mono text-[10px] text-wm-text-muted">
            {shortcutHint}
          </kbd>
        )}
      </div>
    )
  },
)
SearchBar.displayName = 'SearchBar'
