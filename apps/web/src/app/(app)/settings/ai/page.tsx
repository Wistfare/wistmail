'use client'

import { useState } from 'react'
import { Sparkles, Tag, FileText, Mail, Globe2 } from 'lucide-react'
import { SettingsCard } from '@/components/ui/settings-card'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  { id: 'ollama', name: 'Ollama (Local)', description: 'Privacy-first. Runs on your server. No external API calls.', icon: Globe2 },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o and GPT-4o-mini. Requires API key.', icon: Sparkles },
  { id: 'anthropic', name: 'Claude', description: 'Anthropic Claude. Strong reasoning. Requires API key.', icon: Sparkles },
]

const FEATURES = [
  { id: 'smart_replies', name: 'Smart Replies', description: 'AI-generated reply suggestions based on email context', icon: Mail, default: true },
  { id: 'auto_categorize', name: 'Auto-Categorization', description: 'Automatically label and sort incoming emails', icon: Tag, default: true },
  { id: 'summarize', name: 'Thread Summarization', description: 'Generate TL;DR summaries for long email threads', icon: FileText, default: false },
  { id: 'translate', name: 'Email Translation', description: 'Translate email content to your preferred language', icon: Globe2, default: false },
]

export default function AiSettingsPage() {
  const [provider, setProvider] = useState('ollama')
  const [features, setFeatures] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURES.map((f) => [f.id, f.default])),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-wm-accent" />
        <h1 className="text-2xl font-semibold text-wm-text-primary">AI Configuration</h1>
      </div>

      <SettingsCard title="AI Provider" description="Choose your preferred AI provider for email assistance features.">
        <div className="flex gap-3">
          {PROVIDERS.map((p) => {
            const isActive = provider === p.id
            return (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={cn(
                  'flex flex-1 cursor-pointer flex-col gap-2 p-4 text-left transition-colors',
                  isActive
                    ? 'border-2 border-wm-accent bg-wm-accent/5'
                    : 'border border-wm-border hover:border-wm-text-muted',
                )}
              >
                <p className={cn('text-sm font-semibold', isActive ? 'text-wm-accent' : 'text-wm-text-primary')}>
                  {p.name}
                </p>
                <p className="font-mono text-[10px] leading-relaxed text-wm-text-muted">{p.description}</p>
                {isActive && (
                  <span className="mt-1 self-start bg-wm-accent px-2 py-0.5 font-mono text-[9px] font-bold text-wm-text-on-accent">
                    Active
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="AI Features" description="Enable or disable individual AI capabilities.">
        <div className="flex flex-col gap-3">
          {FEATURES.map((f) => {
            const Icon = f.icon
            const enabled = features[f.id]
            return (
              <div key={f.id} className="flex items-center gap-3 border border-wm-border bg-wm-bg p-3">
                <Icon className={cn('h-4 w-4', enabled ? 'text-wm-accent' : 'text-wm-text-muted')} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-wm-text-primary">{f.name}</p>
                  <p className="font-mono text-[10px] text-wm-text-muted">{f.description}</p>
                </div>
                <Toggle
                  checked={enabled}
                  onChange={(checked) => setFeatures((prev) => ({ ...prev, [f.id]: checked }))}
                />
              </div>
            )
          })}
        </div>
      </SettingsCard>
    </div>
  )
}
