'use client'

import { useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  FieldStack,
  IconButton,
  InputField,
  Kbd,
  LabelDot,
  Menu,
  Modal,
  SearchBar,
  SettingsCard,
  Skeleton,
  StatCard,
  Tabs,
  Toggle,
  Tooltip,
  ToastProvider,
  useToast,
} from '@/components/ui'
import {
  Archive,
  Inbox as InboxIcon,
  Mail,
  MoreHorizontal,
  Plus,
  Reply,
  Send,
  Trash2,
} from 'lucide-react'

/**
 * Visual catalog of every UI primitive. Used as a working contract for
 * Phase 1 — every primitive shipped to higher phases should appear here
 * with realistic example usage.
 *
 * Open at /dev/components in a running Next.js dev server.
 */
export default function DevComponentsPage() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-wm-bg p-10">
        <header className="mb-10 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-wm-text-primary">UI Primitives</h1>
          <p className="font-mono text-xs text-wm-text-tertiary">
            Phase 1 contract. Each section maps 1:1 to a Pencil component or visual pattern.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          <ButtonsSection />
          <IconButtonsSection />
          <FormsSection />
          <SearchSection />
          <BadgesSection />
          <AvatarsSection />
          <CardsSection />
          <ToggleSection />
          <TabsSection />
          <MenuSection />
          <ModalSection />
          <DrawerSection />
          <ToastSection />
          <EmptyStateSection />
          <SkeletonSection />
        </div>
      </div>
    </ToastProvider>
  )
}

function Section({ title, spec, children }: { title: string; spec: string; children: React.ReactNode }) {
  return (
    <section>
      <header className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-wm-text-secondary">{title}</h2>
        <p className="font-mono text-[11px] text-wm-text-muted">{spec}</p>
      </header>
      <div className="border border-wm-border bg-wm-surface p-6">{children}</div>
    </section>
  )
}

function ButtonsSection() {
  return (
    <Section title="Button" spec="Pencil: ButtonPrimary/Secondary/Danger — padding [8,14], gap 6, mono 12px">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button icon={<Plus className="h-3.5 w-3.5" />}>New</Button>
        <Button variant="secondary" icon={<Reply className="h-3.5 w-3.5" />}>Reply</Button>
        <Button variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />}>Delete</Button>
        <Button variant="ghost">Ghost</Button>
        <Button loading>Sending</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
      </div>
    </Section>
  )
}

function IconButtonsSection() {
  return (
    <Section title="IconButton" spec="Square icon-only buttons — toolbar / row actions">
      <div className="flex items-center gap-2">
        <Tooltip content="Reply">
          <IconButton aria-label="Reply"><Reply className="h-4 w-4" /></IconButton>
        </Tooltip>
        <Tooltip content="Archive">
          <IconButton aria-label="Archive" variant="surface"><Archive className="h-4 w-4" /></IconButton>
        </Tooltip>
        <Tooltip content="Compose">
          <IconButton aria-label="Compose" variant="accent"><Plus className="h-4 w-4" /></IconButton>
        </Tooltip>
        <Tooltip content="More">
          <IconButton aria-label="More"><MoreHorizontal className="h-4 w-4" /></IconButton>
        </Tooltip>
      </div>
    </Section>
  )
}

function FormsSection() {
  return (
    <Section title="InputField + FieldStack" spec="Pencil: Component/InputField — bg #111, padding [10,14]">
      <div className="grid max-w-2xl grid-cols-2 gap-4">
        <InputField label="Email" placeholder="you@example.com" defaultValue="" />
        <InputField label="Password" type="password" placeholder="••••••••" />
        <InputField label="Subject" placeholder="Re: Q1 product roadmap" error="Required" />
        <InputField label="Hint example" placeholder="org-slug" hint="Letters, digits, dashes only." />
        <FieldStack
          label="Workspace name"
          adornment={<a className="font-mono text-[11px] text-wm-accent" href="#">USE PERSONAL?</a>}
        >
          <InputField placeholder="Wistfare" />
        </FieldStack>
      </div>
    </Section>
  )
}

function SearchSection() {
  const [q, setQ] = useState('')
  return (
    <Section title="SearchBar" spec="Pencil: Component/SearchBar — bg #111, padding [10,16], shortcut chip">
      <SearchBar value={q} onChange={setQ} placeholder="Search emails… (Cmd+K)" shortcutHint="/" />
    </Section>
  )
}

function BadgesSection() {
  return (
    <Section title="Badge / Kbd / LabelDot" spec="Status pills + keyboard chips + colored label dots">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>Default</Badge>
        <Badge variant="accent">Active</Badge>
        <Badge variant="info">Info</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="error">Error</Badge>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <Kbd>/</Kbd>
        <LabelDot color="#BFFF00" label="Primary" />
        <LabelDot color="#3B82F6" label="Updates" />
        <LabelDot color="#F59E0B" label="Promotions" />
      </div>
    </Section>
  )
}

function AvatarsSection() {
  return (
    <Section title="Avatar" spec="Initials + deterministic background; sm/md/lg">
      <div className="flex items-center gap-3">
        <Avatar name="Alex Johnson" size="sm" />
        <Avatar name="Sarah Kim" />
        <Avatar name="Veda Buengimana" size="lg" />
        <Avatar name="Mike Rivers" />
      </div>
    </Section>
  )
}

function CardsSection() {
  return (
    <Section title="Card / SettingsCard / StatCard" spec="Pencil: SettingsCard padding [20,24]; StatCard padding [20,24]">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-3">
          <StatCard title="USERS" value="24" change="+12%" />
          <StatCard title="STORAGE" value="68%" change="+2.1G" />
          <StatCard title="MESSAGES SENT" value="12,847" change="+5%" />
          <StatCard title="DOMAINS" value="3" change="" />
        </div>
        <SettingsCard title="Account" description="Manage your account email and display name.">
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Display name" defaultValue="Veda Buengimana" />
            <InputField label="Email" defaultValue="vedadom@hotmail.com" disabled />
          </div>
        </SettingsCard>
        <Card>
          <p className="font-mono text-xs text-wm-text-secondary">Generic card surface (bg #111, 1px border).</p>
        </Card>
        <Card nested>
          <p className="font-mono text-xs text-wm-text-secondary">Nested card (bg #000, 1px border) — for inner content frames inside SettingsCard.</p>
        </Card>
      </div>
    </Section>
  )
}

function ToggleSection() {
  const [on, setOn] = useState(true)
  return (
    <Section title="Toggle" spec="Switch — accent fill when on">
      <div className="flex items-center gap-4">
        <Toggle checked={on} onChange={setOn} />
        <span className="font-mono text-xs text-wm-text-secondary">{on ? 'on' : 'off'}</span>
      </div>
    </Section>
  )
}

function TabsSection() {
  const [tab, setTab] = useState('all')
  return (
    <Section title="Tabs" spec="Underline tabs with optional count chip — InboxV3, Admin, Meetings">
      <Tabs value={tab} onChange={setTab}>
        <Tabs.Tab value="all" count={42}>All</Tabs.Tab>
        <Tabs.Tab value="mail" count={12}>Mail</Tabs.Tab>
        <Tabs.Tab value="chat" count={3}>Chat</Tabs.Tab>
        <Tabs.Tab value="archived">Archived</Tabs.Tab>
      </Tabs>
    </Section>
  )
}

function MenuSection() {
  return (
    <Section title="Menu" spec="Dropdown — close on outside click / Esc">
      <Menu>
        <Menu.Trigger className="inline-flex cursor-pointer items-center gap-2 border border-wm-border bg-wm-surface px-3 py-2 font-mono text-xs text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary">
          Actions <MoreHorizontal className="h-3.5 w-3.5" />
        </Menu.Trigger>
        <Menu.Items>
          <Menu.Label>Reply</Menu.Label>
          <Menu.Item icon={<Reply className="h-3.5 w-3.5" />} shortcut="R">Reply</Menu.Item>
          <Menu.Item icon={<Send className="h-3.5 w-3.5" />} shortcut="A">Reply all</Menu.Item>
          <Menu.Separator />
          <Menu.Label>Move</Menu.Label>
          <Menu.Item icon={<Archive className="h-3.5 w-3.5" />} shortcut="E">Archive</Menu.Item>
          <Menu.Item icon={<InboxIcon className="h-3.5 w-3.5" />}>Move to inbox</Menu.Item>
          <Menu.Separator />
          <Menu.Item destructive icon={<Trash2 className="h-3.5 w-3.5" />} shortcut="⌫">Delete</Menu.Item>
        </Menu.Items>
      </Menu>
    </Section>
  )
}

function ModalSection() {
  const [open, setOpen] = useState(false)
  return (
    <Section title="Modal" spec="Centered dialog — Esc and backdrop dismiss">
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete email"
        description="This message will be moved to Trash. You can restore it within 30 days."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setOpen(false)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="font-mono text-xs text-wm-text-secondary">
          From: alex@example.com — Subject: Q1 product roadmap review
        </p>
      </Modal>
    </Section>
  )
}

function DrawerSection() {
  const [open, setOpen] = useState(false)
  return (
    <Section title="Drawer" spec="Side panel — used for taskDrawer and compose-as-drawer">
      <Button variant="secondary" onClick={() => setOpen(true)}>Open drawer</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Task details" size="md">
        <div className="flex flex-col gap-4 px-5 py-4">
          <FieldStack label="Title">
            <InputField defaultValue="Ship V3 inbox redesign to staging" />
          </FieldStack>
          <FieldStack label="Notes">
            <InputField defaultValue="" placeholder="What's left?" />
          </FieldStack>
        </div>
      </Drawer>
    </Section>
  )
}

function ToastSection() {
  return (
    <Section title="Toast" spec="Bottom-left undo toast — autodismiss 6s">
      <ToastTrigger />
    </Section>
  )
}

function ToastTrigger() {
  const toast = useToast()
  return (
    <div className="flex gap-3">
      <Button variant="secondary" onClick={() => toast.show({ message: 'Email archived', undo: () => undefined })}>
        Show toast with undo
      </Button>
      <Button variant="ghost" onClick={() => toast.show({ message: 'Saved.' })}>
        Plain toast
      </Button>
    </div>
  )
}

function EmptyStateSection() {
  return (
    <Section title="EmptyState" spec="No-results / inbox-zero illustration block">
      <EmptyState
        icon={<Mail className="h-8 w-8" />}
        title="Inbox zero"
        description="You're caught up. Anything new will land here in real time."
        action={<Button variant="secondary">Compose</Button>}
      />
    </Section>
  )
}

function SkeletonSection() {
  return (
    <Section title="Skeleton" spec="Shimmer placeholder">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10" />
        <Skeleton rows={3} />
      </div>
    </Section>
  )
}
