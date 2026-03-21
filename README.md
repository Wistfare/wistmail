# WistMail

**Open-source email platform. Self-hostable email client + transactional email API.**

WistMail combines a modern email client (like Notion Mail) with a developer-friendly transactional email API (like Resend/SendGrid) — fully open source and self-hostable.

## Features

- **Email Client** — Beautiful, AI-powered email client with smart inbox views, slash commands, and keyboard shortcuts
- **Transactional Email API** — REST API + SMTP relay with SDKs for 8+ languages
- **Self-Hostable** — Deploy on your own VPS in 5 minutes with Docker
- **AI-Powered** — Pluggable AI (Ollama, OpenAI, Claude) for smart replies, categorization, summarization
- **Custom Mail Engine** — Built-in SMTP and IMAP servers with full DKIM/SPF/DMARC support
- **React Email** — Build email templates with React components
- **Analytics** — Open tracking, click tracking, delivery events, webhooks

## Quick Start

```bash
# Clone the repo
git clone https://github.com/Wistfare/wistmail.git
cd wistmail

# Start infrastructure (PostgreSQL, Redis, MinIO, MeiliSearch)
docker compose up -d

# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

## Architecture

| Component | Technology | Description |
|-----------|-----------|-------------|
| Mail Engine | Go | Custom SMTP/IMAP server with authentication |
| API Gateway | Hono (Node.js) | REST API for transactional email |
| Web Client | Next.js 15 | Modern email client UI |
| Admin Panel | Next.js 15 | Server management dashboard |
| Database | PostgreSQL 16 | Primary data store |
| Queue | BullMQ (Redis) | Job processing |
| Search | MeiliSearch | Full-text email search |
| Storage | MinIO / S3 | Attachment storage |
| AI | Ollama / OpenAI / Claude | Pluggable AI layer |

## SDKs

| Language | Package |
|----------|---------|
| TypeScript | `wistmail` |
| Python | `wistmail` |
| Go | `github.com/Wistfare/wistmail/sdks/go` |
| Ruby | `wistmail` |
| PHP | `wistmail/wistmail` |
| Rust | `wistmail` |
| Java | `com.wistmail:wistmail` |
| .NET | `WistMail` |

## License

[MIT](LICENSE)
