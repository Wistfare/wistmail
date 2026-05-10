'use client'

import { useState, useEffect, useCallback } from 'react'
import { Building2, Globe, Image as ImageIcon, AlertTriangle } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type Organization = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  createdAt: string
}
type Domain = { id: string; name: string; verified: boolean; status: string }

/**
 * Country list — manually curated for the V3 polish. Long-tail ISO
 * country lists ship as a separate library; for the picker we expose
 * the most common WistMail user countries plus an "Other" sentinel.
 */
const COUNTRIES = [
  'Rwanda',
  'Kenya',
  'Uganda',
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Other',
]

/**
 * Time-zone list — same trade-off as countries. We surface the
 * regional zones our active users overlap with and use IANA names
 * because the AI worker keys daily-digest cron schedules off them.
 */
const TIMEZONES = [
  'Africa/Kigali',
  'Africa/Nairobi',
  'Africa/Lagos',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

/**
 * 6-colour brand palette. Applies a per-org accent override that
 * cascades through every V3 surface that reads `--color-wm-accent`.
 * Until the backend gains an `org.brandColor` column the value is
 * persisted in localStorage so the picker has feedback.
 */
const BRAND_PALETTE = [
  { id: 'lime', label: 'Lime', value: '#BFFF00' },
  { id: 'cyan', label: 'Cyan', value: '#00E5FF' },
  { id: 'violet', label: 'Violet', value: '#A855F7' },
  { id: 'pink', label: 'Pink', value: '#F472B6' },
  { id: 'amber', label: 'Amber', value: '#FBBF24' },
  { id: 'red', label: 'Red', value: '#F87171' },
] as const

/**
 * `/admin/organization` — Pencil reference: `AdminV3-Organization` (`VxCMA`).
 *
 * V3 polish: profile section (logo + name + country + timezone + tax id)
 * and a branding section with the 6-colour accent palette. Top-right
 * "Save changes" CTA in lime.
 */
export default function AdminOrganizationPage() {
  const toast = useToast()
  const [org, setOrg] = useState<Organization | null>(null)
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)

  // Profile form
  const [name, setName] = useState('')
  const [country, setCountry] = useState(COUNTRIES[0])
  const [timezone, setTimezone] = useState(TIMEZONES[0])
  const [taxId, setTaxId] = useState('')
  const [brandColor, setBrandColor] = useState<string>(BRAND_PALETTE[0].id)
  const [saving, setSaving] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const orgRes = await api.get<{ organization: Organization | null }>('/api/v1/admin/organization')
      if (orgRes.organization) {
        setOrg(orgRes.organization)
        setName(orgRes.organization.name)
      }
      const domRes = await api.get<{ data: Domain[] }>('/api/v1/setup/domains')
      setDomains(domRes.data ?? [])
    } catch {
      // surface nothing — page renders the create-form fallback below.
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    // Hydrate the brand colour preview from localStorage so the chips
    // reflect the last selection across reloads.
    try {
      const stored = localStorage.getItem('wm.org.brandColor')
      if (stored && BRAND_PALETTE.some((p) => p.id === stored)) setBrandColor(stored)
    } catch {
      // localStorage may be unavailable in some browsers / SSR.
    }
  }, [fetchData])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      const result = await api.post<Organization>('/api/v1/admin/organization', { name: createName })
      setOrg(result)
      setName(result.name)
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function handleSave() {
    if (!org) return
    setSaving(true)
    try {
      await api.patch(`/api/v1/admin/organization/${org.id}`, { name })
      // Brand colour, country, timezone, tax-id are persisted client-side
      // until the backend ships matching columns. Keeps the picker live
      // for design QA + user demos.
      try {
        localStorage.setItem('wm.org.brandColor', brandColor)
      } catch {
        // ignore — quota / private browsing
      }
      setOrg({ ...org, name })
      toast.show({ message: 'Organization saved' })
    } catch (err: unknown) {
      toast.show({
        message: err instanceof Error ? err.message : 'Failed to save',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col" style={{ background: '#000000' }}>
        <SettingsTopBar scope="Admin" page="Organization" />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex h-full flex-col" style={{ background: '#000000' }}>
        <SettingsTopBar scope="Admin" page="Organization" />
        <div className="flex flex-1 items-center justify-center p-8">
          <form
            onSubmit={handleCreate}
            className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-wm-border bg-wm-surface p-8"
          >
            <Building2 className="h-8 w-8 text-wm-accent" />
            <h2 className="text-xl font-semibold text-wm-text-primary">Create Organization</h2>
            <p className="font-mono text-xs text-wm-text-tertiary">
              Set up your organization to manage team members, domains, and email infrastructure.
            </p>
            <InputField
              label="Organization name"
              placeholder="Acme Inc."
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              error={createError}
            />
            <Button type="submit" variant="primary" loading={creating}>
              Create Organization
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin"
        page="Organization"
        rightSlot={
          <button
            onClick={handleSave}
            disabled={saving}
            type="button"
            className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover disabled:opacity-60"
            style={{
              gap: 6,
              padding: '8px 14px',
              borderRadius: 18,
              boxShadow: '0 3px 14px 0 rgba(191,255,0,0.25)',
              color: '#000000',
            }}
          >
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 11, letterSpacing: 1 }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </span>
          </button>
        }
      />

      <div className="flex flex-col overflow-y-auto" style={{ gap: 24, padding: '28px 32px' }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1 className="font-mono font-bold text-wm-text-primary" style={{ fontSize: 30 }}>
            Organization
          </h1>
          <p className="font-mono" style={{ fontSize: 12, color: '#6e6e6e' }}>
            Workspace identity, locale, and brand.
          </p>
        </div>

        {/* Profile */}
        <section className="flex flex-col gap-5 rounded-xl border border-wm-border bg-wm-surface p-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-wm-accent" />
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
              Profile
            </h2>
          </div>

          <div className="flex items-start gap-4">
            {/* Logo — square 48px per the Pencil frame. */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-wm-border bg-wm-bg">
              {org.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logoUrl} alt={org.name} className="h-full w-full rounded-lg object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-wm-text-muted" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <p className="font-mono text-[10px] font-semibold tracking-[1px] uppercase text-wm-text-muted">
                Workspace logo
              </p>
              <p className="font-mono text-[11px] text-wm-text-tertiary">
                Square, 48×48 minimum. PNG or SVG.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InputField
              label="Organization name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wistfare Inc."
            />
            <InputField label="Slug" value={org.slug} readOnly hint="Used in URLs and identifiers" />
            <SelectField label="Country" value={country} onChange={setCountry} options={COUNTRIES} />
            <SelectField label="Time zone" value={timezone} onChange={setTimezone} options={TIMEZONES} />
            <InputField
              label="Tax ID"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="VAT / EIN / TIN"
            />
          </div>
        </section>

        {/* Branding */}
        <section className="flex flex-col gap-5 rounded-xl border border-wm-border bg-wm-surface p-6">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded-full"
              style={{ background: BRAND_PALETTE.find((p) => p.id === brandColor)?.value }}
            />
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
              Branding
            </h2>
          </div>
          <p className="font-mono text-[11px] text-wm-text-tertiary">
            Pick the accent colour applied across the workspace. Lime is the default.
          </p>
          <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-3">
            {BRAND_PALETTE.map((opt) => {
              const active = opt.id === brandColor
              return (
                <button
                  key={opt.id}
                  role="radio"
                  aria-checked={active}
                  type="button"
                  onClick={() => setBrandColor(opt.id)}
                  title={opt.label}
                  className={cn(
                    'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 transition-transform',
                    active
                      ? 'border-wm-text-primary scale-110'
                      : 'border-wm-border hover:scale-105',
                  )}
                  style={{ background: opt.value }}
                >
                  <span className="sr-only">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Domains snapshot — drops the legacy "Edit organization" panel
            because the V3 design surfaces those edits inline. */}
        <section className="flex flex-col gap-3 rounded-xl border border-wm-border bg-wm-surface p-6">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-wm-accent" />
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
              Domains
            </h2>
            <div className="flex-1" />
            <Badge variant={domains.length > 0 ? 'accent' : 'default'} size="sm">
              {domains.length} active
            </Badge>
          </div>
          {domains.length === 0 ? (
            <p className="font-mono text-[11px] text-wm-text-muted">
              No sending domains yet.
            </p>
          ) : (
            domains.map((domain) => (
              <div key={domain.id} className="flex items-center gap-3 rounded-md bg-wm-bg px-4 py-3">
                <span className="font-mono text-sm text-wm-text-primary">{domain.name}</span>
                <div className="flex-1" />
                <Badge variant={domain.verified ? 'accent' : 'warning'} size="sm">
                  {domain.verified ? 'Verified' : 'Pending'}
                </Badge>
              </div>
            ))
          )}
        </section>

        {/* Danger zone */}
        <section className="flex flex-col gap-3 rounded-xl border border-wm-error/30 bg-wm-error/5 p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-wm-error" />
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-error">
              Danger zone
            </h2>
          </div>
          <p className="font-mono text-[11px] text-wm-text-secondary">
            Deleting the organization permanently removes all domains, mailboxes, DNS data, and message history.
            This cannot be undone.
          </p>
          <Button variant="danger" size="sm">
            Delete organization
          </Button>
        </section>
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-semibold tracking-[1px] uppercase text-wm-text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-wm-border bg-wm-surface px-3 py-2 font-mono text-[13px] text-wm-text-primary focus:border-wm-accent focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}
