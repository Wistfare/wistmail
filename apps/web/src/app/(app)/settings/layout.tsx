/**
 * Settings layout — pure passthrough.
 *
 * The V3 settings pages each render their own `<PageHeader>` and own
 * the chrome around it; the layout only exists so the route group keeps
 * a stable shell and so we can scope styles here in the future without
 * touching every page.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col">{children}</div>
}
