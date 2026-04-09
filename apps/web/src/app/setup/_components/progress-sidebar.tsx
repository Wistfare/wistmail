'use client'

import { Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step {
  id: string
  label: string
  desc: string
  icon: LucideIcon
}

interface ProgressSidebarProps {
  steps: Step[]
  currentStep: number
}

export function ProgressSidebar({ steps, currentStep }: ProgressSidebarProps) {
  return (
    <div className="flex w-[45%] flex-col items-center justify-center bg-wm-surface p-12">
      <div className="mb-12 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center bg-wm-accent">
          <span className="text-lg font-bold text-wm-text-on-accent">W</span>
        </div>
        <span className="font-mono text-xl font-semibold tracking-[3px] text-wm-text-primary">WISTFARE MAIL</span>
      </div>

      <div className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const Icon = s.icon
          const completed = i < currentStep
          const active = i === currentStep
          return (
            <div key={s.id} className="flex items-center gap-4">
              <div
                className={`flex h-10 w-10 items-center justify-center transition-all duration-300 ${
                  completed
                    ? 'bg-wm-accent'
                    : active
                      ? 'bg-wm-accent shadow-[0_0_12px_rgba(191,255,0,0.3)]'
                      : 'border border-wm-border'
                }`}
              >
                {completed ? (
                  <Check className="h-5 w-5 text-wm-text-on-accent" />
                ) : (
                  <Icon className={`h-5 w-5 ${active ? 'text-wm-text-on-accent' : 'text-wm-text-muted'}`} />
                )}
              </div>
              <div>
                <p
                  className={`text-sm ${
                    active ? 'font-semibold text-wm-accent' : completed ? 'text-wm-text-primary' : 'text-wm-text-muted'
                  }`}
                >
                  {s.label}
                </p>
                <p className="font-mono text-[10px] text-wm-text-muted">{s.desc}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
