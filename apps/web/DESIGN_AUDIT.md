# WistMail Web — Design Audit (Phase 0)

Source of truth: `wistmail/design.lib.pen` (V3 screen variants).
This audit enumerates every web/desktop V3 screen, the design tokens, and the reusable components — so Phase 1+ can be implemented pixel-for-pixel without guessing.

---

## 1. Design tokens (CSS variables)

| Token              | Value     | Usage                                |
|--------------------|-----------|--------------------------------------|
| `--wm-bg`          | `#000000` | Page background                      |
| `--wm-surface`     | `#111111` | Card, list-row, drawer surface       |
| `--wm-surface-hover` | `#1A1A1A` | Hover/active row                  |
| `--wm-border`      | `#1A1A1A` | Hairline borders                     |
| `--wm-accent`      | `#BFFF00` | Primary buttons, active nav, focus   |
| `--wm-accent-dim`  | `#1A2200` | Accent-tinted backgrounds            |
| `--wm-text-on-accent` | `#000000` | Text inside accent buttons       |
| `--wm-text-primary` | `#FFFFFF` | Headings, body                      |
| `--wm-text-secondary` | `#999999` | Secondary text                    |
| `--wm-text-tertiary` | `#6E6E6E` | De-emphasized                      |
| `--wm-text-muted`  | `#404040` | Disabled / placeholder               |
| `--wm-success`     | `#BFFF00` | Success                              |
| `--wm-info`        | `#3B82F6` | Info                                 |
| `--wm-warning`     | `#F59E0B` | Warning                              |
| `--wm-error`       | `#FF4444` | Destructive, errors                  |

Theme: dark, lime-accented, monospace flavor for code/labels.

---

## 2. Reusable components in design

Pencil reusable components (use as 1:1 React component contracts):

- `Component/SidebarV2` (`PobTe`) — composite shell
- `Component/IconRailItemActive` (`Djs8O`)
- `Component/IconRailItem` (`2pThr`)
- `Component/Sidebar` (legacy, `lflx7`)
- `Component/NavItemActive` (`B58x6`)
- `Component/NavItem` (`dR379`)
- `Component/EmailItemUnread` (`9o4F2`)
- `Component/EmailItemRead` (`sziTg`)
- `Component/ButtonPrimary` (`Rx9Hd`) — lime fill, black text
- `Component/ButtonSecondary` (`LUySl`) — outline
- `Component/ButtonDanger` (`erLpP`)
- `Component/InputField` (`NZeuG`)
- `Component/SearchBar` (`IK7sU`)
- `Component/SettingsCard` (`Qe9gL`)
- `Component/StatCard` (`Oq10q`)
- `Web/AttachmentChip/Pdf` (`fTLb3`)
- `Web/AttachmentChip/Image` (`ryDnq`)
- `Web/AttachmentBadge` (`bKnSj`)
- `Web/ICSCard` (`RVYzn`)
- `Web/EmailRowWithAttachments` (`U7ek7`)

Mobile-only (skip for web): `Mobile/*` variants.

---

## 3. Web/Desktop V3 screens (build targets)

### Auth & onboarding
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `Ar0aI`     | LoginV3                        | `/login`                        |
| `XTWjb`     | MFAChallengeV3                 | `/mfa/challenge`                |
| `Jon4p`     | SetupV3-Domain                 | `/setup` (step 1)               |
| `iYWpV`     | SetupV3-DNS-Choose             | `/setup/dns`                    |
| `CXgQ0`     | SetupV3-DNS-Manual             | `/setup/dns/manual`             |
| `u5uqW`     | SetupV3-DNS-Verify             | `/setup/dns/verify`             |
| `m8JIs`     | SetupV3-Account                | `/setup/account`                |
| `Z8tTv`     | SetupV3-Done                   | `/setup/done`                   |

### Inbox & email
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `TB36x`     | InboxV3                        | `/inbox`                        |
| `kCXs5`     | InboxV3-NewAll                 | `/inbox?compose=all`            |
| `D1EUTv`    | InboxV3-NewMail                | `/compose`                      |
| `Tj2PK`     | InboxV3-NewChat                | `/compose?type=chat`            |
| `tYDXb`     | FloatingCompose                | overlay component               |
| `Qe0q2`     | ComposeV3-Signature            | compose / signature picker      |
| `Mxst9`     | taskDrawer                     | overlay/drawer                  |
| `d1eVM`/`bqeVQ` | InboxV3-Tablet             | tablet breakpoint               |

### Calendar
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `gpSWG`     | CalendarV3 (week)              | `/calendar`                     |
| `ghtzf`     | CalendarV3-Month               | `/calendar?view=month`          |
| `hxPAf`/`K7zBj` | CalendarV3-Tablet          | tablet breakpoint               |

### Work / Projects / Tasks
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `QAyVs`     | WorkV3 (My day)                | `/work`                         |
| `pBrWV`     | ProjectV3 (kanban)             | `/work/projects/[id]`           |
| `hXcQi`     | ProjectV3-TaskDetail           | `/work/projects/[id]/tasks/[id]` |
| `y0jKZ`/`E9CXP` | ProjectV3-Tablet           | tablet breakpoint               |

### Chat
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `X1Safv`    | ChatViewV3                     | `/chat/[id]`                    |
| `USjob`     | GroupChatV3                    | `/chat/[id]` (group)            |
| `yzyel`     | NewChatV3                      | `/chat/new`                     |
| `buCwq`     | NewGroupV3                     | `/chat/new?type=group`          |
| `mCFcx`     | ChatViewV3-Reactions           | reactions overlay               |
| `wpEpZ`/`uQHB5` | ChatViewV3-Tablet           | tablet breakpoint               |

### Docs
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `sOpka`     | DocsV3 (cards)                 | `/docs`                         |
| `IMtz2`     | DocsV3-Editor                  | `/docs/[id]`                    |

### Meetings
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `RTarH`     | MeetingsV3                     | `/meetings`                     |
| `t0tR0`     | MeetingsV3-InCall              | `/meetings/[id]`                |

### Settings
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `QWQRT`     | SettingsV3-Account             | `/settings/account`             |
| `oNDps`     | SettingsV3-Signatures          | `/settings/signatures`          |
| (existing)  | Two-Factor / Labels / Domains / API Keys / Webhooks — keep current routes; restyle to match V3. |

### Admin
| Pencil node | Screen                         | Web route                       |
|-------------|--------------------------------|---------------------------------|
| `boHfA`     | AdminV3-Overview               | `/admin`                        |
| `hxB5G`     | AdminV3-Users                  | `/admin/users`                  |
| `udt2q`     | AdminV3-CreateUser             | `/admin/users/new`              |

---

## 4. Layout system

All authenticated screens share a 3-zone shell:

```
┌──────┬──────────┬──────────────────────────────────┐
│      │          │                                  │
│ rail │ sidebar  │       primary content            │
│ 64px │ 240px    │       fills remainder            │
│      │          │                                  │
│      │          │  (some screens add a 3rd column  │
│      │          │   "Today" / detail panel ~320px) │
└──────┴──────────┴──────────────────────────────────┘
```

- **Icon rail** (`Component/IconRailItem(Active)`) — Mail, Chat, Calendar, Work, Docs, Meetings, Admin (when role), Settings, profile avatar.
- **Sidebar** — context-aware: Mail folders+labels, Chat list, Calendar mini-month + calendar list, Project list, Settings nav, Admin nav.
- **Content column** — screen body; some screens (Inbox, Work) include a third right-hand panel.

---

## 5. Backend / API gap analysis

Endpoints already present in `apps/api`: auth, mfa, inbox, sent, drafts, scheduled, search, labels, signatures, domains, api-keys, webhooks, admin/users, chat (mobile V3), today (mobile V3), projects/tasks/docs (mobile V3), preferences, device-tokens.

**Likely-needed additions for V3 web parity** (will confirm per phase as we open each screen):

- `GET /api/v1/calendar/events?from&to` — currently mobile uses placeholder; web week/month views need real backed list.
- `POST /api/v1/calendar/events`, `PUT /api/v1/calendar/events/:id`, `DELETE` — event create/edit/delete.
- `GET /api/v1/calendar/calendars` — list of user calendars (Personal, Work, etc.) used in left sidebar.
- `GET /api/v1/work/today` — already exists as `/today`; may need extension for "Today's flow" panel.
- `GET /api/v1/projects` (list), `POST /api/v1/projects`, `PUT /api/v1/projects/:id`.
- Project columns/board: `GET/PATCH /api/v1/projects/:id/columns`, plus task ordering.
- `GET /api/v1/docs`, `POST /api/v1/docs`, `PUT /api/v1/docs/:id`, doc body persistence (content blocks).
- `GET /api/v1/meetings`, `POST /api/v1/meetings`, `POST /api/v1/meetings/:id/join`.
- `GET /api/v1/admin/overview` — stats card on AdminV3-Overview.
- `GET /api/v1/admin/audit-log` — already exists; UI consumer.
- `GET /api/v1/storage/usage` — settings storage breakdown (mail, attachments, drafts, trash).

Each phase will (1) inspect the corresponding Pencil screen to verify exact data shape, (2) add the missing endpoints, (3) wire the UI, (4) test.

---

## 6. Phase ordering & exit criteria

Each phase ends with: dev server up, screen-by-screen visual diff against design, every API call exercised against running API, `pnpm typecheck` + `pnpm test` green.

1. **Phase 1** — Tokens + primitives.
2. **Phase 2** — Shell (rail + sidebar + layout).
3. **Phase 3** — Auth (Login, MFA, Setup wizard).
4. **Phase 4** — Inbox & compose & email folders & search.
5. **Phase 5** — Calendar.
6. **Phase 6** — Work / Projects / Tasks.
7. **Phase 7** — Chat.
8. **Phase 8** — Docs.
9. **Phase 9** — Meetings.
10. **Phase 10** — Settings.
11. **Phase 11** — Admin.
12. **Phase 12** — Tablet variants.
13. **Phase 13** — End-to-end test pass over every screen + API.
