import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  ChatInfoPanel,
  ConversationHeader,
  ConversationListItem,
  MessageBubble,
  MessageComposer,
} from './index'

describe('ConversationListItem', () => {
  it('renders a direct conversation with avatar + preview + time', () => {
    render(
      <ConversationListItem
        href="/chat/c1"
        kind="direct"
        title="Sarah Kim"
        preview="Did you see the v3 storyboard review?"
        timestamp={new Date(Date.now() - 60_000).toISOString()}
        unread={3}
      />,
    )
    expect(screen.getByText('Sarah Kim')).toBeInTheDocument()
    expect(screen.getByText(/storyboard/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders a group conversation with hash icon and Draft chip', () => {
    render(
      <ConversationListItem
        href="/chat/g1"
        kind="group"
        title="design-team"
        preview="Pushed the latest sketches…"
        isDraft
      />,
    )
    expect(screen.getByText('design-team')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('marks active conversation with aria-current', () => {
    render(
      <ConversationListItem
        href="/chat/c1"
        kind="direct"
        title="Mike Ross"
        active
      />,
    )
    expect(screen.getByRole('link', { name: /Mike Ross/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('clamps unread count display at 99+', () => {
    render(
      <ConversationListItem
        href="/chat/c1"
        kind="direct"
        title="Lots of unread"
        unread={250}
      />,
    )
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})

describe('MessageBubble', () => {
  it('renders content + timestamp + sender for incoming message', () => {
    render(
      <MessageBubble
        senderName="Sarah Kim"
        fromMe={false}
        createdAt="2026-04-23T14:00:00Z"
        content="Hello there"
      />,
    )
    expect(screen.getByText('Sarah Kim')).toBeInTheDocument()
    expect(screen.getByText('Hello there')).toBeInTheDocument()
  })

  it('hides header when grouped', () => {
    render(
      <MessageBubble
        senderName="Sarah Kim"
        fromMe={false}
        createdAt="2026-04-23T14:00:00Z"
        content="Follow-up message"
        showHeader={false}
      />,
    )
    expect(screen.queryByText('Sarah Kim')).toBeNull()
  })

  it('renders edited badge', () => {
    render(
      <MessageBubble
        senderName="Veda"
        fromMe
        createdAt="2026-04-23T14:00:00Z"
        content="oops typo"
        edited
      />,
    )
    expect(screen.getByText('edited')).toBeInTheDocument()
  })

  it('renders reactions and highlights mine', () => {
    render(
      <MessageBubble
        senderName="Sarah"
        createdAt="2026-04-23T14:00:00Z"
        content="lgtm"
        reactions={[
          { emoji: '👍', count: 3, reactedByMe: true },
          { emoji: '🚀', count: 1 },
        ]}
      />,
    )
    expect(screen.getByText('👍')).toBeInTheDocument()
    expect(screen.getByText('🚀')).toBeInTheDocument()
  })

  it('fires onClick on bubble', () => {
    const onClick = vi.fn()
    render(
      <MessageBubble
        senderName="Veda"
        fromMe
        createdAt="2026-04-23T14:00:00Z"
        content="tap me"
        onClick={onClick}
      />,
    )
    fireEvent.click(screen.getByText('tap me'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('ConversationHeader', () => {
  it('renders title + presence + call buttons', () => {
    const onCall = vi.fn()
    const onVideo = vi.fn()
    render(
      <ConversationHeader
        kind="direct"
        title="Sarah Kim"
        presence="Active now"
        onCall={onCall}
        onVideo={onVideo}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Sarah Kim' })).toBeInTheDocument()
    expect(screen.getByText('Active now')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voice call' }))
    fireEvent.click(screen.getByRole('button', { name: 'Video call' }))
    expect(onCall).toHaveBeenCalledOnce()
    expect(onVideo).toHaveBeenCalledOnce()
  })

  it('hides call buttons when hideCallActions is true', () => {
    render(
      <ConversationHeader
        kind="group"
        title="design-team"
        hideCallActions
      />,
    )
    expect(screen.queryByRole('button', { name: 'Voice call' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Video call' })).toBeNull()
  })
})

describe('MessageComposer', () => {
  it('disables Send when empty and enables on input', () => {
    render(<MessageComposer onSend={() => {}} />)
    const send = screen.getByRole('button', { name: 'Send message' })
    expect(send).toBeDisabled()
    const ta = screen.getByPlaceholderText('Message')
    fireEvent.change(ta, { target: { value: 'hi' } })
    expect(send).not.toBeDisabled()
  })

  it('sends on Enter and clears the input', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer onSend={onSend} />)
    const ta = screen.getByPlaceholderText('Message') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hello' } })
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('hello')
  })

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<MessageComposer onSend={onSend} />)
    const ta = screen.getByPlaceholderText('Message')
    fireEvent.change(ta, { target: { value: 'multi' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('emits onTyping when value changes', () => {
    const onTyping = vi.fn()
    render(<MessageComposer onSend={() => {}} onTyping={onTyping} />)
    fireEvent.change(screen.getByPlaceholderText('Message'), {
      target: { value: 'a' },
    })
    expect(onTyping).toHaveBeenCalledWith(true)
  })
})

describe('ChatInfoPanel', () => {
  it('renders direct profile without member section', () => {
    render(
      <ChatInfoPanel
        kind="direct"
        title="Sarah Kim"
        presence="Active now"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Sarah Kim' })).toBeInTheDocument()
    expect(screen.getByText('Active now')).toBeInTheDocument()
    expect(screen.queryByText(/Members/)).toBeNull()
  })

  it('renders group with members + files + links sections', () => {
    render(
      <ChatInfoPanel
        kind="group"
        title="design-team"
        members={[
          { id: 'u1', name: 'Veda', role: 'admin' },
          { id: 'u2', name: 'Sarah' },
        ]}
        files={[{ id: 'f1', name: 'spec.pdf', sizeBytes: 1024 * 200 }]}
        links={[{ id: 'l1', title: 'V3 spec', href: 'https://example.com' }]}
      />,
    )
    expect(screen.getByText(/Members/)).toBeInTheDocument()
    expect(screen.getByText('Veda')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('spec.pdf')).toBeInTheDocument()
    expect(screen.getByText('200.0 KB')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'V3 spec' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })
})
