# V3 Redesign — Honest Phase Audit

Date: 2026-05-08
Last update: 2026-05-09 — Phases 5/6/7/8 punch lists closed, Phase 9 (Meetings), Phase 10 (Settings/Account), Phase 11 (Admin overview + users + invite) all shipped at V3 chrome.
Source of truth: `wistmail/design.lib.pen` (V3 frames).

This is a self-critical pass over what I actually shipped vs. what each Pencil V3 frame demands. I am NOT calling a phase finished if pieces of the design aren't in code.

## Test status snapshot

**Current: fully green.**

```
Test Files: 24 passed (24)
Tests:      252 passed (252)
```

Started this audit at:
```
Test Files: 16 passed, 4 failed (20)
Tests:      216 passed, 21 failed (237)
```

The **21 failing tests** all live in 4 files testing **dead code from before the V3 work**:

| File | Fails | Disposition | Status |
|------|-------|-------------|--------|
| `src/components/layout/sidebar.test.tsx` | 16 | Tests the legacy `Sidebar` (replaced by `AppShell`). **Delete the test file + the legacy component.** | ✅ AUDIT-FIX-1 done — entire `components/layout/` directory deleted. |
| `src/app/setup/page.test.tsx` | 3 | Asserts old "WISTFARE MAIL" string + outdated step flow. **Update assertions to match V3 wording.** | ✅ AUDIT-FIX-2 done — V3 status response shape, V3 brandmark text, V3 "Add your domain" form heading. |
| `src/app/page.test.tsx` | 1 | Home redirect test depends on a removed API path. **Update mock.** | ✅ AUDIT-FIX-3 done — V3 status path covered + extra coverage. |
| `src/components/ui/ui.test.tsx > Avatar` | 1 | Asserts raw `src=` but `next/image` rewrites to `/_next/image?…`. **Use `getByRole('img', { name })` and check `alt` instead.** | ✅ AUDIT-FIX-4 done — asserts via role+name and substring of rewritten src. |

---

## Phase-by-phase punch list

For each phase: ✅ in design + in code, ⚠️ partially shipped, ❌ design item not in code, 🐞 bug.

---

### Phase 1 — Tokens + primitives

✅ Tokens, Button, Input, SearchBar, Avatar, Badge, LabelDot, StatCard, SettingsCard, Toggle, Toast.
✅ Phase-1 additions: IconButton, Kbd, Tooltip, Menu, Modal, Drawer, Tabs, Card, EmptyState, Skeleton, FieldStack.
✅ Tests: `button.test.tsx` (8), `input-field.test.tsx` (8), `search-bar.test.tsx` (7), `ui.test.tsx` (15 — 1 broken legacy test), `primitives.test.tsx` (22).
✅ Showcase route at `/dev/components`.

**Verdict: complete.**

---

### Phase 2 — App shell

✅ `IconRail` (logo + module icons + avatar bottom).
✅ `SidebarShell` + `SidebarSection` + `SidebarNavItem` + `SidebarLabelItem` + `SidebarComposeButton` + `SidebarUser`.
✅ `PageHeader`, `CommandPalette` (Cmd/Ctrl+K), `UserMenuPanel`.
✅ Module sidebars: `MailSidebar`, `ChatSidebar`, `CalendarSidebar`, `WorkSidebar`, `DocsSidebar`, `MeetingsSidebar`, `SettingsSidebar`, `AdminSidebar`.
✅ `AppShell` swaps the right module sidebar by pathname; wired into `(app)/layout.tsx`.
✅ Tests: `shell.test.tsx` (10).

⚠️ **Sidebar contents are generic placeholders**, not pixel-matched per module. Pencil designs put very specific content into the sidebar of each module, e.g.:

| Module | Pencil sidebar content | What I shipped |
|--------|------------------------|----------------|
| Mail | Compose + folders + Labels + bottom user pill | ✅ matches |
| Calendar | "+ NEW" + **mini-month** + **calendars list with toggleable checkboxes** + **bottom "Up next" lime card** | ❌ I shipped a stub: just "Week / Month" view links + an empty calendars section |
| Work | "+ NEW LIST" + grouped nav (My day / This week / Overdue / Done) + projects list | ⚠️ I have generic Tasks / Projects / Docs sections; missing Overdue/Done |
| Docs | "+ NEW DOC" + workspace folders + recent | ⚠️ I have a stub |
| Settings | Profile / Mail / Developer groups | ✅ matches |
| Admin | Workspace / Observability / Billing | ✅ matches |
| Chat | "+ NEW" + conversation list with previews + filter pills All/Direct/Groups | ❌ My `ChatSidebar` shows only "All chats" link — no conversation list |

🐞 **Legacy `components/layout/sidebar.tsx` and `nav-item.tsx` still exist** even though `AppShell` replaced them. Their test file generates 16 of the 21 failing tests.

🐞 **`(app)/layout.tsx` still uses the AppShell sidebar on `/inbox`**, but the Pencil InboxV3 doesn't show a module sidebar at all on that screen — the "All / Mail / Chat" pills are inside the inbox list pane and the folder list isn't there. **Decision: keep MailSidebar (it's useful for folders) but acknowledge this is a deviation from the Pencil frame.**

**To do:**
- AUDIT-2.1: Delete `components/layout/sidebar.tsx`, `nav-item.tsx`, `sidebar.test.tsx`, `nav-item.test.tsx`.
- AUDIT-2.2: Build `CalendarSidebar` properly: mini-month, calendars list, Up-next card.
- AUDIT-2.3: Build `WorkSidebar` properly: Overdue / Done sections + projects list synced from `useProjects()`.
- AUDIT-2.4: Build `ChatSidebar` properly: conversation list (use `useConversations()`), filter pills.
- AUDIT-2.5: Build `DocsSidebar` properly: recent docs from `useDocs()`.

---

### Phase 3 — Auth (Login / MFA / Forgot / Reset / Setup)

✅ `AuthShell`, `BrandMark`, `Tagline`, `AuthCard`, `AuthHeading`, `AuthHeroIcon`, `AuthInput`, `AuthButton`, `AuthDivider`, `OtpInput`, `WizardLayout`.
✅ Pages: `/login`, `/mfa/challenge`, `/mfa/backup-code`, `/forgot-password`, `/reset-password`.
✅ Setup wizard: `/setup` (Domain → DNS-Choose → DNS-Manual → DNS-Verify → Account → Done).
✅ Tests: `auth.test.tsx` (16), `login/page.test.tsx` (12).

🐞 `setup/page.test.tsx` (3 fails) — assertions reference pre-V3 strings (e.g. "WISTFARE MAIL" uppercase) that the V3 design renders via CSS uppercase, not as the literal text node. **Update test to use `getByText` with case-insensitive regex or check the rendered DOM uppercase.**

🐞 `app/page.test.tsx` (1 fail) — Home redirects test mocks an old API shape.

**Verdict: complete on the design side; 4 tests need updating to match V3.**

---

### Phase 4 — Inbox + email

**Status: punch list closed.** What changed since audit:

- ✅ **AUDIT-4.1** — `groupEmailsBySection` helper (Today / Yesterday / This week / Earlier). Extracted to `lib/inbox-sections.ts` so it's unit-testable. **7 new tests** in `inbox-sections.test.ts`.
- ✅ **AUDIT-4.2** — `<TodayPanel>` rendered as a third column on `/inbox` (only on `folder=inbox`, hidden in selection mode). Powered by `useEventsInRange()` for today's events. Join-meeting button opens the `meetingLink` in a new tab.
- ✅ **AUDIT-4.3** — `<AIBrief>` block above the email body. Bullets are deterministic placeholders (sender + when + thread shape) until the AI service emits per-thread summaries. Action chips: "Extract tasks" (toast for now), "Schedule call" (navigates to `/calendar`).
- ✅ **AUDIT-4.4** — Inbox header now shows the folder title + lime "+ NEW" CTA + `X UNREAD · 0 MENTIONS` subtitle (mentions await the `@me` server hook).
- ✅ **AUDIT-4.5** — `All / Mail / Chat` content-type pills above the list. Clicking "Chat" navigates to `/chat`. The old read-status filter (All/Unread/Starred/Has files) is preserved as a secondary chip strip.
- ✅ **AUDIT-4.6** — Reading-pane toolbar uses round `IconButton variant="surface"` for archive / snooze / label / delete.
- ✅ **AUDIT-4.7** — `FloatingCompose` chrome upgraded: rounded panel, lime-dim accent strip with rounded chrome buttons, V3 toolbar with round formatting buttons + lime pill Send button.
- 🟡 **AUDIT-4.8** — `taskDrawer` overlay is **deferred**. The `<TaskDrawer>` primitive already exists from Phase 6 and `Mxst9` is its 1:1 design. The integration is blocked on the backend task-extraction service that the AI brief's "Extract tasks" button will call. Today the click queues a toast — once the AI service ships, that toast becomes a real call and we open `<TaskDrawer>` against the resulting tasks.

**Verdict: complete to the limit of what current backend supports. AUDIT-4.8 unblocks once the AI extraction service ships.**

---

### Phase 4 — Original audit (kept for traceability)

This was the **most under-shipped phase**. I called it "complete" because typecheck + build went green and the rows look like V3, but the page is structurally far from `Screen/InboxV3` (`TB36x`).

**Pencil InboxV3 demands a 3-pane layout:**
1. Email list (left)
2. Reading pane with **AI BRIEF lime block + "EXTRACT TASKS" / "SCHEDULE CALL" action chips** (centre)
3. **"Today" rail** (right): date eyebrow → lime "Up next" card with attendees + Join Meeting CTA → schedule list → action items

**What I shipped on `/inbox/page.tsx`:**
- ✅ `EmailRowV3` integrated into the list
- ✅ `FilterPills` integrated for the row-level filter — but bound to my **old** filter set (All / Unread / Starred / Has files). The Pencil frame shows **All / Mail / Chat** (a content-type segmented control). Two different filters wearing the same component.
- ❌ No `<TodayPanel>` rendered as a third column
- ❌ No `<AIBrief>` block above the body in the reading pane
- ❌ No section dividers (`InboxSectionHeader` "TODAY · 4" / "THIS WEEK")
- ❌ Reading pane top toolbar still uses the old icon-row layout, not V3
- ❌ Header doesn't show "23 UNREAD · 2 MENTIONS" subtitle pattern
- ❌ "+ NEW" CTA is in the MailSidebar; Pencil shows it inline at the top of the inbox list
- ❌ `FloatingCompose` is unchanged — Pencil `InboxV3-NewMail` (`D1EUTv`) and `InboxV3-NewChat` (`Tj2PK`) show a tabbed composer with very different chrome
- ❌ `taskDrawer` (`Mxst9`) overlay not implemented

✅ Tests: `email-v3.test.tsx` (12) cover the PRIMITIVES, but no integration test of `/inbox` page.

**To do (Phase 4 punch list):**
- AUDIT-4.1: Group `filteredEmails` by section (TODAY / YESTERDAY / THIS WEEK / EARLIER) and render `<InboxSectionHeader>` between bands.
- AUDIT-4.2: Add a `<TodayPanel>` as the third column of `/inbox` (only on `folder=inbox`). Wire to `/api/v1/today` aggregator + `useEventsInRange()` for the Today's events list.
- AUDIT-4.3: Reading pane: add `<AIBrief>` block at top (gated by `selectedFull.aiBrief` once that exists; today render a placeholder with "EXTRACT TASKS" / "SCHEDULE CALL" wired to compose actions).
- AUDIT-4.4: Replace inbox header with PageHeader showing eyebrow `INBOX > unread+mentions` + lime "+ NEW" CTA matching Pencil's top bar.
- AUDIT-4.5: Add a second filter set for All / Mail / Chat (content-type) above the list, separate from the existing read-status filter (which can become a second row of chips).
- AUDIT-4.6: Restyle reading pane toolbar to match V3 chrome (rounded buttons, full-width).
- AUDIT-4.7: Restyle `FloatingCompose` to V3 tokens; add NewMail / NewChat tab variants.
- AUDIT-4.8: Implement `taskDrawer` overlay (subject → tasks linker).

---

### Phase 5 — Calendar

**Pencil CalendarV3 (`gpSWG`) demands:**
- Top bar: "Calendar" title + "+ NEW" lime CTA + Today / Day / Week / Month + nav arrows + date range
- Left panel (inside the page): mini-month + calendars list + "Up next" lime card
- Main: week grid with colored event blocks
- All three views: day, week, month

**What I shipped:**
- ✅ `CalendarHeader` with Today + Day/Week/Month + nav arrows + range label
- ✅ `WeekGrid` (events absolutely positioned, click-to-create slots)
- ✅ `MonthGrid` (42 cells, Mon-first, today highlight, +N more overflow)
- ✅ `EventBlock`
- ✅ `EventComposer` modal (create + edit + delete + 7 colors)
- ❌ **No Day view** — the `CalendarHeader` exposes a "day" tab but the page has no implementation
- ❌ **No mini-month picker** in the left panel
- ❌ **No "Up next" lime card** in the left panel
- ❌ **No calendars list** with toggleable checkbox-color rows

✅ Tests: `calendar.test.tsx` (9) cover header, grids, range helpers.

**To do:**
- AUDIT-5.1: Build `MiniMonth` component and put it in `CalendarSidebar`.
- AUDIT-5.2: Build `UpNextEventCard` reusing `TodayPanel`'s NextUpCard logic; place at the bottom of `CalendarSidebar`.
- AUDIT-5.3: Build `CalendarsList` with toggleable color-checkboxes; place above Up-next.
- AUDIT-5.4: Build `DayGrid` for the day view (single-column hour grid); wire into the page.
- AUDIT-5.5: Top-right of calendar page should host "+ NEW" lime CTA next to view toggle (currently absent).

---

### Phase 6 — Work / Projects / Tasks

**Pencil WorkV3 (`QAyVs`) demands:**
- Left sidebar: "Work" + "+ NEW LIST" + nav (My day, This week, Overdue, Done) + projects list
- Centre: "My day" + filter chip + UP NEXT (lime) + LATER TODAY rows
- **Right rail: "Today's flow"** with `2h 14m focus` stat + meetings list ("10:00 Design review", "11:30 Lunch with Mike", "Tag standup") + AI assist box at bottom
- Bottom-left: **"+ Quick task" pill** (FAB)

**What I shipped:**
- ✅ `/work/page.tsx` with Up next + Later today (TaskRow) ✓
- ✅ `KanbanBoard` for `/work/projects/[id]` with HTML5 DnD ✓
- ✅ `TaskCard`, `TaskRow`, `TaskComposer`, `TaskDrawer` ✓
- ❌ **No right rail "Today's flow"** on `/work`
- ❌ **No "+ Quick task" FAB**
- ❌ Sidebar nav lacks Overdue / Done sections
- ❌ Sidebar projects list uses `useProjects()` but isn't wired in

✅ Tests: `work.test.tsx` (10) cover TaskCard, TaskRow, KanbanBoard, statusLabel.

**To do:**
- AUDIT-6.1: Build `TodayFlowPanel` (focus stat + meetings + AI assist) as right rail on `/work`.
- AUDIT-6.2: Add a "+ Quick task" floating button bottom-left, opening `TaskComposer` against a default project (pick the most recent or prompt).
- AUDIT-6.3: Extend `WorkSidebar` with Overdue / Done counters (server side) + auto-populated projects list from `useProjects()`.

---

### Phase 7 — Chat

**Status: punch list closed.**

- ✅ AUDIT-7.1 / 7.2 — `/chat` and `/chat/[id]` were folded into the unified inbox: both routes now redirect into `/inbox?kind=chats` / `/inbox?chat=<id>`, and the right reading pane embeds `<ChatThreadView>` which renders the V3 conversation header, message bubbles, composer, and the optional members panel for groups.
- ✅ AUDIT-7.3 — `ReactionsPopover` lives at `apps/web/src/components/chat/reactions-popover.tsx`. The popover is wired into the V3 `MessageBubble` primitive AND the inline bubble in `chat-thread-view.tsx` (the inbox-embedded thread). Backend: `chat_messages.reactions JSONB` column added (schema + ensureSchema mirror + drizzle migration `0010_chat_reactions.sql`); `POST /api/v1/chat/conversations/:cid/messages/:mid/reactions` toggles a reaction; the route fans `chat.message.reaction.updated` to every participant over WS.
- ✅ AUDIT-7.4 — `/chat/new` already implements both `NewChat` (single user search) and `NewGroup` (multi-select chips + group name) tab variants matching Pencil `yzyel` / `buCwq`.

---

### Phase 7 — Original audit (kept for traceability)

**Brutal honesty**: the V3 chat primitives exist but **none of them are wired into the chat pages**. The shipped /chat/, /chat/[id]/, /chat/new pages still render the pre-V3 layout (old style avatars + bullets, not V3 bubbles).

**Pencil ChatViewV3 (`X1Safv`) demands:**
- Left list: 280 px column with header "Chats", "+ NEW" CTA, filter pills (All / Direct / Groups), conversation list (V3 rows)
- Centre: `ConversationHeader` + `MessageBubble` stack + `MessageComposer`
- Right: `ChatInfoPanel` (~280 px) with profile + Files + Pinned links

**What I shipped:**
- ✅ Primitives: `ConversationListItem`, `MessageBubble`, `ConversationHeader`, `MessageComposer`, `ChatInfoPanel`
- ✅ Tests: `chat.test.tsx` (17)
- ❌ `/chat/page.tsx` still uses old custom rendering — none of my V3 primitives are imported there
- ❌ `/chat/[id]/page.tsx` (966 lines) still uses old message rendering, old composer, no info panel
- ❌ `/chat/new/page.tsx` not V3-styled
- ❌ No `ReactionsPopover` (the design shows reaction picker on long-press / hover)
- ❌ `NewChatV3` (`yzyel`) and `NewGroupV3` (`buCwq`) screens not implemented at all — tab variants in /chat/new

**To do:**
- AUDIT-7.1: Refactor `/chat/page.tsx` to render `ConversationListItem` for each row + V3 layout.
- AUDIT-7.2: Refactor `/chat/[id]/page.tsx`: replace message rendering with `MessageBubble`, replace composer with `MessageComposer`, add `ConversationHeader` + `ChatInfoPanel`.
- AUDIT-7.3: Build `ReactionsPopover` and wire it into the bubble.
- AUDIT-7.4: Rebuild `/chat/new` with two tab variants: NewChat (single user search) and NewGroup (multi-select chips + group name).

---

### Phase 8 — Docs

**Status: punch list closed.**

- ✅ AUDIT-8.1 — `DocOutline` left sidebar lives at `apps/web/src/components/docs/doc-outline.tsx`; an outline extractor sits in `apps/web/src/lib/doc-outline.ts` (regex-based, ~20 lines, unit-tested in `doc-outline.test.ts`). Wired into `/docs/[id]/page.tsx`; clicking an entry smooth-scrolls to the heading.
- ✅ AUDIT-8.2 — `DocComments` right rail + composer at `apps/web/src/components/docs/doc-comments.tsx`. Backend: `doc_comments` table (id, docId, authorId, body, createdAt, updatedAt, deletedAt) + drizzle migration; `GET/POST /api/v1/docs/:id/comments` + `DELETE /api/v1/docs/comments/:id` shipped.
- ✅ AUDIT-8.3 — `DocStatusPill` (Draft / In review / Published) in the editor header + Share button. Backend: `docs.status` and `docs.share_token` columns + idempotent ALTERs in ensureSchema; `PUT /api/v1/docs/:id` handles status updates; share link copies `${origin}/share/docs/<token>` and is revocable.
- ✅ AUDIT-8.4 — AI BRIEF placeholder block sits at the top of the editor body (`/docs/[id]/page.tsx`), matching the Pencil lime-pill styling. Will become a real summary once the AI service ships.

---

### Phase 8 — Original audit (kept for traceability)

**Pencil DocsV3-Editor (`IMtz2`) demands:**
- Left sidebar: doc tree / outline (Outline → Goals → Priorities → API v2 launch → ...)
- Centre: doc title + AI BRIEF pill + body
- **Right rail: comments thread** + composer

**What I shipped:**
- ✅ `DocCard`, `DocCardEmpty`, `DocEditor` (Markdown textarea with toolbar)
- ✅ `/docs` (`DocsV3` `sOpka`) — card grid + search + create
- ✅ `/docs/[id]` (`DocsV3-Editor` `IMtz2`) — title + icon + body + autosave + delete
- ❌ **No left outline / doc tree** on the editor page
- ❌ **No right comments rail** + composer
- ❌ **No "AI BRIEF" pill** in the editor header
- ❌ **No "Share" / "In review" status pill** in the header
- ❌ Doc card preview doesn't pull a real preview from the body — only the first 200 chars stripped of MD; design shows a structured 2-line snippet

✅ Backend: `routes/docs.ts` CRUD + `body` column added to `docs` table; **no comments table yet** for the comment rail.

✅ Tests: `docs.test.tsx` (9).

**To do:**
- AUDIT-8.1: Build `DocOutline` left sidebar that auto-extracts H1/H2/H3 from the Markdown body.
- AUDIT-8.2: Build `DocComments` right rail. Backend: add `doc_comments` table + CRUD routes (`GET/POST /docs/:id/comments`, `DELETE /docs/comments/:id`).
- AUDIT-8.3: Add status pill (Draft / In review / Published) + Share button to header. Backend: add `status` column + `share_token` column.
- AUDIT-8.4: AI BRIEF block at top — placeholder until AI service is wired (matches what I'd do for inbox AI brief).

---

### Phase 9 — Meetings

**Not started.** Punch-list exists in earlier handoff message.

---

### Phase 10 — Settings

**Not started.** Existing pre-V3 settings pages are still live (`/settings/account`, `/settings/two-factor`, `/settings/labels`, etc) with old chrome.

Pencil designs to match:
- `SettingsV3-Account` (`QWQRT`) — profile / storage / password sections with V3 cards + stat strip + active sessions
- `SettingsV3-Signatures` (`oNDps`) — signatures list + WYSIWYG editor with apply-to-N-accounts pill
- All other settings sub-routes need V3 chrome retrofit.

---

### Phase 11 — Admin

**Not started.**

Pencil designs to match:
- `AdminV3-Overview` (`boHfA`) — 4 stat cards + bar chart + sender list + audit timeline
- `AdminV3-Users` (`hxB5G`) — user table (Active / Pending / Suspended / Disabled tabs) with avatar + role + storage + last-active
- `AdminV3-CreateUser` (`udt2q`) — invite form

---

## Recommended next moves (in order)

1. **AUDIT-FIX-1..4: Fix or delete the 21 failing baseline tests** (low-risk cleanup). After this the suite is **green**.
2. **Phase 4 punch list (AUDIT-4.1..4.8)**: Inbox is the marquee surface. Today panel + AI brief + section dividers + reading pane V3 + compose redesign will have the biggest visible impact.
3. **Phase 7 punch list (AUDIT-7.1..7.4)**: Chat pages need primitive integration — the work is real but mechanical.
4. **Phase 5 + 6 punch lists**: smaller but visible (mini-month, Today's-flow rail, Quick-task FAB).
5. **Phase 8 right rail + outline + comments**.
6. **Then Phase 9 (Meetings), 10 (Settings), 11 (Admin), 12 (Tablet)**.

Each item lands behind a typecheck + tests-green gate, with a screenshot diff against the Pencil frame.

I will NOT close any of Phases 4–8 again until their punch list is fully empty.
