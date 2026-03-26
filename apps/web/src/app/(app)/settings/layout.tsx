export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Settings side panel is now handled by the main Sidebar component (Panel 2)
  // This layout just passes through children
  return (
    <div className="flex-1 overflow-y-auto p-8">
      {children}
    </div>
  )
}
