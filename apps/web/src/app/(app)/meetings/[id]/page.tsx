'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Button } from '@/components/ui'
import { InCallSkeleton } from '@/components/meetings'
import { useMeeting } from '@/lib/meeting-queries'

/**
 * `/meetings/[id]` — Pencil reference: `MeetingsV3-InCall` (`t0tR0`).
 *
 * The actual media plane (WebRTC) isn't wired yet; we render the V3
 * in-call chrome and link out to the meeting URL. When the user joins
 * they get the placeholder layout while their browser tab opens the
 * external link.
 */
export default function MeetingInCallPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const meeting = useMeeting(params.id)

  if (meeting.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
      </div>
    )
  }

  if (meeting.isError || !meeting.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="font-mono text-sm text-wm-error">
          Couldn&rsquo;t load this meeting.
        </p>
        <Link href="/meetings">
          <Button variant="secondary">Back to meetings</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={
          <Link
            href="/meetings"
            className="inline-flex items-center gap-1 hover:text-wm-accent"
          >
            <ArrowLeft className="h-3 w-3" />
            All meetings
          </Link>
        }
        title={meeting.data.title}
        subtitle="In call"
      />
      <div className="flex-1 overflow-hidden">
        <InCallSkeleton
          meeting={meeting.data}
          onLeave={() => router.push('/meetings')}
        />
      </div>
    </div>
  )
}
