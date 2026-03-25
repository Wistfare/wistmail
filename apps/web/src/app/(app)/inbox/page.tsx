export default function InboxPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center bg-wm-accent">
          <span className="text-wm-text-on-accent text-3xl font-bold">W</span>
        </div>
        <h1 className="text-xl font-semibold text-wm-text-primary">Inbox</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Coming in PR #5 — Inbox & Email
        </p>
      </div>
    </div>
  )
}
