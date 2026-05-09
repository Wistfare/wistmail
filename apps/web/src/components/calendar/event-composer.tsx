'use client'

import { useEffect, useState } from 'react'
import { Modal, Button, FieldStack, InputField } from '@/components/ui'
import {
  type CalendarEvent,
  type EventInput,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from '@/lib/event-queries'

export interface EventComposerProps {
  open: boolean
  onClose: () => void
  /** When provided we edit; otherwise we create. */
  event?: CalendarEvent
  /** Default start time when creating. */
  defaultStart?: Date
}

const DEFAULT_COLOR = '#BFFF00'

/** Modal form for creating or editing a calendar event. */
export function EventComposer({ open, onClose, event, defaultStart }: EventComposerProps) {
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const remove = useDeleteEvent()

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [error, setError] = useState('')

  // Reset form on open / event change.
  useEffect(() => {
    if (!open) return
    if (event) {
      setTitle(event.title)
      setLocation(event.location ?? '')
      setMeetingLink(event.meetingLink ?? '')
      setStart(toDatetimeLocal(new Date(event.startAt)))
      setEnd(toDatetimeLocal(new Date(event.endAt)))
      setColor(event.color)
    } else {
      const s = defaultStart ?? defaultStartForNow()
      const e = new Date(s)
      e.setHours(s.getHours() + 1)
      setTitle('')
      setLocation('')
      setMeetingLink('')
      setStart(toDatetimeLocal(s))
      setEnd(toDatetimeLocal(e))
      setColor(DEFAULT_COLOR)
    }
    setError('')
  }, [open, event, defaultStart])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!start || !end) {
      setError('Start and end are required')
      return
    }
    const startAt = new Date(start).toISOString()
    const endAt = new Date(end).toISOString()
    if (new Date(endAt) <= new Date(startAt)) {
      setError('End time must be after start')
      return
    }
    const payload: EventInput = {
      title: title.trim(),
      location: location.trim() || undefined,
      meetingLink: meetingLink.trim() || null,
      startAt,
      endAt,
      color,
    }
    try {
      if (event) {
        await update.mutateAsync({ id: event.id, ...payload })
      } else {
        await create.mutateAsync(payload)
      }
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save event')
    }
  }

  async function handleDelete() {
    if (!event) return
    if (!confirm(`Delete “${event.title}”?`)) return
    try {
      await remove.mutateAsync(event.id)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete event')
    }
  }

  const saving = create.isPending || update.isPending
  const deleting = remove.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? 'Edit event' : 'New event'}
      footer={
        <>
          {event && (
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={(e) => submit(e as unknown as React.FormEvent)} loading={saving}>
            {event ? 'Save changes' : 'Create event'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <InputField
          label="Title"
          placeholder="Design review with Sarah"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <FieldStack label="Starts">
            <DateTimeInput value={start} onChange={setStart} />
          </FieldStack>
          <FieldStack label="Ends">
            <DateTimeInput value={end} onChange={setEnd} />
          </FieldStack>
        </div>
        <InputField
          label="Location"
          placeholder="Conference room A"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <InputField
          label="Meeting link"
          placeholder="https://meet.example.com/abc"
          value={meetingLink}
          onChange={(e) => setMeetingLink(e.target.value)}
        />
        <FieldStack label="Color">
          <ColorRow value={color} onChange={setColor} />
        </FieldStack>
        {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}
      </form>
    </Modal>
  )
}

function DateTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[42px] w-full border border-wm-border bg-wm-surface px-3 font-mono text-[13px] text-wm-text-primary outline-none focus:border-wm-accent"
    />
  )
}

const PRESET_COLORS = [
  '#BFFF00', // accent
  '#A78BFA', // purple
  '#F59E0B', // amber
  '#3B82F6', // blue
  '#EC4899', // pink
  '#22D3EE', // cyan
  '#FF4444', // red
]

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Use ${c}`}
          aria-pressed={value === c}
          className="relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-105"
          style={{
            backgroundColor: c,
            borderColor: value === c ? '#FFFFFF' : 'transparent',
            outline: value === c ? `1px solid ${c}` : 'none',
          }}
        />
      ))}
    </div>
  )
}

function defaultStartForNow(): Date {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
