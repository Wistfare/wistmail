export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar placeholder — will be built in PR #2 */}
      <aside className="hidden lg:flex w-60 flex-col border-r border-wm-border bg-wm-surface">
        <div className="flex items-center gap-2.5 px-4 py-6">
          <div className="flex h-7 w-7 items-center justify-center bg-wm-accent">
            <span className="text-wm-text-on-accent text-base font-bold">W</span>
          </div>
          <span className="font-mono text-sm font-semibold tracking-[3px] text-wm-text-primary">
            WISTMAIL
          </span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
