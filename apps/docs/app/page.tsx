import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="max-w-2xl space-y-6 py-20">
        <div className="mx-auto flex h-16 w-16 items-center justify-center bg-fd-primary text-fd-primary-foreground text-2xl font-bold">
          W
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Wistfare Mail Documentation</h1>
        <p className="text-lg text-fd-muted-foreground">
          Send transactional emails, manage domains, and build integrations with the Wistfare Mail API.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center rounded-md bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow-sm hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="/docs/api/sending"
            className="inline-flex items-center rounded-md border border-fd-border px-6 py-3 text-sm font-medium hover:bg-fd-accent"
          >
            API Reference
          </Link>
        </div>
      </div>
    </main>
  )
}
