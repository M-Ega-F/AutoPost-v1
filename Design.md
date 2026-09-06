# AutoPost — UI Design System

Canonical file: `Design.md` at the repository root. `AGENTS.md` currently points at `@DESIGN.md`; after Next.js is scaffolded, update that single reference to `@Design.md` so both agree. Until then, this file is the authoritative UI reference for creating and reviewing any component or page.

Status of the stack: Next.js is **not** scaffolded yet. Tailwind CSS and shadcn/ui are **not** installed yet. Everything below is written for the planned stack and for the token convention that `npx shadcn init` will emit, so the values in this document can be pasted straight into the generated theme block.

## 0. Scope and stack

| Concern | Decision |
| --- | --- |
| Framework | Next.js 16, App Router, TypeScript |
| Styling | Tailwind CSS with the shadcn/ui CSS-variable (HSL channel) convention |
| Components | shadcn/ui (Radix primitives), icons from `lucide-react` |
| Fonts | Geist Sans, exposed as `--font-geist-sans` by `next/font`, mapped to Tailwind `font-sans` |
| Auth | Supabase Auth (email + password) |
| Data | PostgreSQL via Supabase, Drizzle ORM |
| Routes | `/` (public landing page, section 6.0), `/login`, `/signup`, `/dashboard`, `/create-post`, `/scheduled`, `/history`, `/connected-accounts`, `/settings` |

Hard scope boundary: this design system covers the MVP only. Instagram, Facebook Page and TikTok are the only platforms. Six nav items is the complete navigation. If a component or copy string is not described here, it is out of MVP and must not be added without updating this file first.

---

## 1. Design principles

The product is a simple poster, not a social-media management suite. Every screen must read as one linear flow:

```
Upload  →  pick platform  →  publish / schedule  →  done
```

Priority order when trade-offs arise — earlier wins:

1. **Simple** — one decision per screen, no configuration to understand.
2. **Fast** — fewest clicks and fewest fields; no blocking on slow social APIs.
3. **Clear** — the user always knows what happened to each post on each platform.
4. **Reliable** — never claim success the system has not confirmed; never lose a scheduled post silently.

### 1.1 Explicitly out of MVP — do not design or build

These features are named in the master plan (sections 43 and 44) as excluded. A pull request that introduces any of them is out of scope:

- technical terminology in the UI (no "webhook", "queue", "job", "execution id", "OAuth", "payload", "HTTP 400")
- complex configuration
- unnecessary settings
- advanced analytics
- social inbox
- team management
- approval workflows
- AI caption generator
- complex content calendar
- hashtag management
- analytics dashboard
- bulk upload
- collaboration features

Also excluded by the MVP limits (one post = one caption, one post = one media): carousel, multiple media per post, per-platform custom captions, comments.

### 1.2 Language rules

- User-facing copy is plain English, second person, sentence case ("Publish now", not "PUBLISH NOW").
- Errors are written for a non-technical user: "TikTok rejected this media format." — never "HTTP 400", never a raw provider error string, never a stack trace.
- Never surface tokens, secrets, internal IDs, or provider internals in the UI.
- When a sentence names a platform and no platform is known, the generic subject fallback is "This platform" (see 5.6). Sentences are phrased around it so the fallback still reads correctly: "Instagram is no longer connected." → "This platform is no longer connected."

---

## 2. Design tokens

All colours are defined as HSL **channel** values (no `hsl()` wrapper) in `src/app/globals.css`, inside the `:root` and `.dark` blocks that `npx shadcn init` generates, with `@theme inline` mappings in the Tailwind config. Components must reference semantic tokens only (`bg-background`, `text-muted-foreground`); raw palette classes (`bg-zinc-100`, `text-gray-500`) are forbidden.

Current visual direction: the token values implement a restrained neon refresh. Dark mode uses electric violet, cyan, and deep navy; light mode uses the same palette as soft lavender and cyan surfaces. The runtime values in `src/app/globals.css` are the source of truth when they differ from the illustrative values below.

### 2.1 Base semantic tokens

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--background` | `0 0% 100%` | `240 10% 3.9%` | App canvas |
| `--foreground` | `240 10% 3.9%` | `0 0% 98%` | Primary text |
| `--card` | `0 0% 100%` | `240 10% 3.9%` | Card surface |
| `--card-foreground` | `240 10% 3.9%` | `0 0% 98%` | Text on card |
| `--popover` | `0 0% 100%` | `240 10% 3.9%` | Dropdown / popover surface |
| `--popover-foreground` | `240 10% 3.9%` | `0 0% 98%` | Text in popover |
| `--primary` | `240 5.9% 10%` | `0 0% 98%` | Primary button, active nav item |
| `--primary-foreground` | `0 0% 98%` | `240 5.9% 10%` | Text on primary |
| `--secondary` | `240 4.8% 95.9%` | `240 3.7% 15.9%` | Secondary button, subtle fills |
| `--secondary-foreground` | `240 5.9% 10%` | `0 0% 98%` | Text on secondary |
| `--muted` | `240 4.8% 95.9%` | `240 3.7% 15.9%` | Muted surfaces, skeleton base |
| `--muted-foreground` | `240 3.8% 46.1%` | `240 5% 64.9%` | Secondary text, meta, helper text |
| `--accent` | `240 4.8% 95.9%` | `240 3.7% 15.9%` | Hover fill on menu items and rows |
| `--accent-foreground` | `240 5.9% 10%` | `0 0% 98%` | Text on accent |
| `--destructive` | `0 72% 45%` | `0 72% 58%` | Destructive actions, failed status |
| `--destructive-foreground` | `0 0% 98%` | `0 0% 98%` | Text on destructive |
| `--border` | `240 5.9% 90%` | `240 3.7% 15.9%` | All borders, dividers |
| `--input` | `240 5.9% 90%` | `240 3.7% 15.9%` | Input / textarea borders |
| `--ring` | `240 5.9% 10%` | `240 4.9% 83.9%` | Focus ring |
| `--radius` | `0.5rem` | `0.5rem` | Radius base (see 2.3) |

Note on `--destructive`: the shadcn default (`0 84.2% 60.2%` light / `0 62.8% 30.6%` dark) is replaced with the values above so destructive text meets 4.5:1 contrast on both backgrounds.

### 2.2 Status tokens (append after the shadcn block)

shadcn/ui ships no success/warning/info tokens, so add these to the same theme block. Each tone has three values: `-surface` (badge/alert background), the tone itself (icon, text, border accent), and `-border`.

| Token | Light | Dark |
| --- | --- | --- |
| `--success` | `142 72% 29%` | `142 69% 58%` |
| `--success-surface` | `142 70% 96%` | `142 45% 12%` |
| `--success-border` | `142 55% 82%` | `142 40% 28%` |
| `--warning` | `32 95% 34%` | `38 92% 62%` |
| `--warning-surface` | `48 100% 96%` | `38 55% 12%` |
| `--warning-border` | `48 96% 78%` | `38 50% 30%` |
| `--info` | `217 91% 45%` | `213 94% 72%` |
| `--info-surface` | `214 95% 96%` | `217 55% 15%` |
| `--info-border` | `213 93% 82%` | `215 45% 32%` |
| `--destructive-surface` | `0 86% 97%` | `0 45% 14%` |
| `--destructive-border` | `0 91% 86%` | `0 40% 30%` |

### 2.3 Neutral scale guidance

Never use raw Tailwind neutrals. Use these semantic layers only:

| Layer | Token / class | Use for |
| --- | --- | --- |
| Canvas | `bg-background` | App background, page background |
| Surface | `bg-card` | Cards, dialogs, dropdowns, table header strips |
| Recessed | `bg-muted` | Skeleton base, disabled inputs, neutral badges |
| Hover | `bg-accent` | Menu items, clickable rows, ghost button hover |
| Divider | `border-border`, `<Separator />` | Card borders, table rules, section dividers |

Text hierarchy is three levels, no more:

1. `text-foreground` — titles, values, primary content.
2. `text-muted-foreground` — helper text, timestamps, meta, empty-state body.
3. `text-primary-foreground` on any filled button.

Opacity-modified text (`text-foreground/60`) is not allowed; use `text-muted-foreground`.

### 2.4 Border radius

Base: `--radius: 0.5rem` (8px). Derived, exactly as shadcn generates them:

| Token / class | Value | Applies to |
| --- | --- | --- |
| `rounded-sm` (`calc(var(--radius) - 4px)`) | 4px | Checkboxes, small chips, progress bar |
| `rounded-md` (`calc(var(--radius) - 2px)`) | 6px | Buttons, inputs, textareas, selects, badges, menu items |
| `rounded-lg` (`var(--radius)`) | 8px | Cards, dialogs, popovers, sheets, dropzones, media previews |
| `rounded-xl` (`calc(var(--radius) + 4px)`) | 12px | Not used in MVP |

Full-pill (`rounded-full`) is reserved for avatars and spinners only. Avatars never use square radii.

### 2.5 Spacing scale

Tailwind's 4px base. Only these steps are used, so spacing stays rhythmic:

| Step | px | Typical use |
| --- | --- | --- |
| `1` | 4 | Icon-to-label gap inside badges, counter gap |
| `2` | 8 | Label-to-input gap, button icon gap, badge-to-badge gap |
| `3` | 12 | Tight card padding on mobile, table cell padding |
| `4` | 16 | Default card padding, gap between list rows, gap between nav items |
| `6` | 24 | Gap between page sections, card header padding |
| `8` | 32 | Gap between major page blocks, empty-state padding |
| `10` | 40 | Empty-state vertical padding |
| `12` | 48 | Not used in MVP |

Fixed rules:

- Page container: `mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8`.
- Composer (Create Post) container: `max-w-2xl`.
- Card: `p-4 md:p-6`, header `space-y-1`, content `space-y-4`.
- Form: field group `space-y-2` (label + control + helper), field groups `space-y-6`.
- Table cell: `px-4 py-3`.
- Stacked card grid: `gap-4`.

### 2.6 Typography

One family, one weight ramp. Font stack: `var(--font-geist-sans)`, with system fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. No serif, no mono in the UI except external IDs (see 6.5).

| Role | Class | Size / line-height | Weight | Applies to |
| --- | --- | --- | --- | --- |
| Display / page title | `text-2xl font-semibold tracking-tight` | 24 / 32 | 600 | Exactly one `<h1>` per page |
| Section title | `text-base font-medium` | 16 / 24 | 500 | Card titles, dialog titles, table group headers |
| Body | `text-sm` | 14 / 20 | 400 | Default UI text, table cells, form values, buttons |
| Label | `text-sm font-medium` | 14 / 20 | 500 | Form labels (`<Label>`), nav items when active |
| Caption / meta | `text-xs` | 12 / 16 | 400 | Timestamps, helper text, character counter, badge text, empty-state body |

Additional rules:

- Captions and post text always render with `break-words` and `whitespace-pre-wrap`; user captions inside list rows use `line-clamp-2`.
- Timestamps in tables use `tabular-nums` and a fixed format (see 6.4).
- Never bold body text for emphasis; use section title or a badge.
- Heading levels are sequential: `<h1>` page, `<h2>` card/section, `<h3>` sub-item. Never skip.

### 2.7 Shadow and elevation

Flat by default. Elevation is used only where an element floats above the page.

| Level | Class | Applies to |
| --- | --- | --- |
| 0 | `shadow-none` | Cards, tables, inputs, buttons at rest (border only) |
| 1 | `shadow-sm` | Cards (optional, `border` alone is preferred and is the default) |
| 2 | `shadow-md` | Dropdowns, popovers, selects, tooltips, toasts |
| 3 | `shadow-lg` | Dialogs, sheets, calendar popovers |

Banned: coloured or tinted shadows, gradients, glow, blur-backdrop effects, and any shadow deeper than `shadow-lg`.

### 2.8 Focus ring

Every interactive element uses the shadcn default ring. Never remove outline without replacing it.

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
```

- Applied to: `Button` (all variants), `Input`, `Textarea`, `Checkbox`, `Select` trigger, `Tabs` trigger, `DropdownMenu` items, `Dialog` close, dropzone, table row action buttons, links in the sidebar.
- `ring-offset-background` ensures the ring is visible on both light and dark.
- Destructive controls keep `--ring` (do not switch to a red ring; the label and icon already signal danger).
- Custom interactive elements (a `div` dropzone) must carry `tabindex="0"` plus the same ring classes and a `keydown` handler for Enter and Space.

---

## 3. Component inventory

Install with `npx shadcn@latest add <component>`. Only the components below are in MVP.

| Component | Use for |
| --- | --- |
| `button` | All actions: Publish now, Schedule, Retry, Cancel, Connect, Reconnect, Disconnect, Remove, Log out, pagination |
| `input` | Email, password, media URL, time field, search (history) |
| `textarea` | Post caption |
| `checkbox` | Platform selection on Create Post |
| `card` | Page sections, dashboard widgets, platform account cards, login and settings panels |
| `badge` | Every status and platform indicator (see 3.2) |
| `dialog` | Schedule confirmation, cancel confirmation, disconnect confirmation, post detail on mobile |
| `dropdown-menu` | Header user menu, row overflow actions (`…`) |
| `select` | Timezone (IANA), time picker, retry target when ambiguous |
| `label` | Every form field label, always paired with `htmlFor` |
| `tabs` | Media source switch: "Upload file" / "Paste URL" |
| `table` | Scheduled and History lists on `md` and up |
| `skeleton` | Loading cards, table rows, account cards |
| `sonner` | Toasts for async action outcomes only |
| `tooltip` | Truncating text (full caption), disabled-but-explained platform, icon-only buttons |
| `separator` | Divider between card sections and inside dropdown menus |
| `avatar` | Social account avatar and header user avatar |
| `alert` | Needs-reconnect banner, page-level form error, disconnected-account warning inside a card |
| `progress` | Media upload progress only |
| `sheet` | Mobile navigation drawer |
| `calendar` + `popover` | Date picker in the schedule dialog |
| `form` / react-hook-form + zod | Create Post, Schedule, Login validation |

Not installed in MVP: `command`, `combobox`, `carousel`, `chart`, `data-table`, `accordion`, `drawer`, `resizable`, `navigation-menu`, `breadcrumb`, `sidebar` block. The timezone picker uses `select`, not a combobox, to keep the dependency surface small.

### 3.1 Button variants and sizes

| Variant | Class variant | Use for |
| --- | --- | --- |
| Primary | `default` | The single main action per screen: "Publish now", "Schedule post", "Create post", "Connect", "Log in", "Retry" |
| Secondary | `secondary` | Alternative primary path: "Schedule" next to "Publish now", "Save" |
| Outline | `outline` | Neutral secondary actions: "Reconnect", "Cancel" in dialogs, "Upload file" |
| Ghost | `ghost` | Low-emphasis row actions, "Remove" on media preview, icon buttons |
| Destructive | `destructive` | **Confirming** a destructive action inside a dialog: "Disconnect", "Cancel post" |
| Danger outline | `danger` (custom variant, see below) | **Triggering** a destructive action from a card or row: "Disconnect" on the account card, "Cancel" on a scheduled row |
| Link | `link` | Inline navigation: "Connect TikTok to publish there." |

Sizes:

| Size | Height | Use for |
| --- | --- | --- |
| `sm` | 32px (`h-8`) | In-row actions ("Retry", "Retry TikTok", "Cancel"), badge-adjacent buttons |
| `default` | 36px (`h-9`) | All form actions, page header actions, dialog actions |
| `lg` | 40px (`h-10`) | Login submit only |
| `icon` | 36x36 (`size-9`) | Icon-only buttons: remove media, close, row overflow menu. On mobile, render at `h-11 w-11` |

Rules:

- The `danger` variant is added to `src/components/ui/button.tsx` (`buttonVariants`): transparent background, `border-destructive-border`, `text-destructive`, hover `bg-destructive-surface`. Destructive actions are always two-step: `danger` (or `ghost` in a row) opens a `Dialog`; the dialog's confirm button is `destructive`.
- Loading button: disable the control, prepend `<Loader2 className="size-4 animate-spin" />`, and keep a verb in the label — "Publishing…", "Scheduling…", "Retrying…", "Connecting…", "Logging out…", "Saving…", "Disconnecting…", "Adding…". Never leave a label-less spinner.
- Disabled buttons must explain why, via a `Tooltip` or adjacent helper text: "Select at least one platform.", "Add media to continue.", "Caption is too long."
- One primary (`default`) button per view. Exceptions: the Create Post footer has "Publish now" (primary) and "Schedule" (secondary) side by side, because they are alternative paths of the same action.

### 3.2 Badge conventions

Badge is the single status primitive; status is never expressed with coloured text alone. Extend `badgeVariants` with tone variants so no page composes colour classes by hand:

| Variant | Surface | Text / icon | Border |
| --- | --- | --- | --- |
| `neutral` | `--muted` | `--muted-foreground` | transparent |
| `info` | `--info-surface` | `--info` | `--info-border` |
| `success` | `--success-surface` | `--success` | `--success-border` |
| `warning` | `--warning-surface` | `--warning` | `--warning-border` |
| `danger` | `--destructive-surface` | `--destructive` | `--destructive-border` |

- Badges are `rounded-md`, `text-xs`, `font-medium`, `gap-1`, with a `size-3` (12px) lucide icon before the label, plus `capitalize` off — labels are written with the exact casing in section 5.
- Platform badges are always `neutral` with no colour, so platform and status remain visually distinct.
- Badges are non-interactive. A badge never becomes a button; put the action in a neighbouring button.

---

## 4. App shell and layout

### 4.1 Sidebar

Fixed left column, `w-64` (16rem), `border-r border-border bg-card`, visible at `lg` (1024px) and up. Exactly six items, in this order, no dividers, no collapsible groups, no footer items:

| Order | Label | Route | Icon |
| --- | --- | --- | --- |
| 1 | Dashboard | `/dashboard` | `LayoutDashboard` |
| 2 | Create Post | `/create-post` | `SquarePen` |
| 3 | Scheduled | `/scheduled` | `CalendarClock` |
| 4 | History | `/history` | `History` |
| 5 | Connected Accounts | `/connected-accounts` | `Link2` |
| 6 | Settings | `/settings` | `Settings` |

- Item: `h-10`, `gap-3`, `px-3`, `rounded-md`, `text-sm`; active item is `bg-accent text-accent-foreground font-medium`, inactive is `text-muted-foreground hover:bg-accent/50 hover:text-foreground`.
- Active state is matched on pathname prefix; `Create Post` is active on `/create-post` only.
- No badge counts, no nested items, no "upgrade", no collapsible sections. A seventh item requires updating this document first.
- Brand lockup at the top of the sidebar: `h-14`, app name in `text-sm font-semibold`, no logo mark is required.

### 4.2 Header

`h-14` (56px), `sticky top-0 z-30`, `border-b border-border bg-background`, full width of the content column.

Contents, left to right:

1. Mobile only (`lg:hidden`): `Button variant="ghost" size="icon"` with `Menu` icon, `aria-label="Open navigation"`, opens the `Sheet`.
2. Empty spacer (the page title lives in the page header, not the header).
3. Right: theme toggle (`aria-label="Switch to dark mode"` / `"Switch to light mode"`) followed by the user menu — `DropdownMenu` triggered by `<Avatar>` (`size-8`) with `aria-label="Account menu"`. Menu items: user email as a non-interactive `DropdownMenuLabel` in `text-xs text-muted-foreground`, a `Separator`, then "Log out" (`DropdownMenuItem` with `LogOut` icon).

No global search, no notifications bell, no global "Create post" button in the header.

### 4.3 Mobile behaviour

- Below `lg`, the sidebar is replaced by a `Sheet` (`side="left"`, `w-64`) triggered from the header menu button. The sheet contains the same six items and nothing else; it closes on navigation and on Escape.
- No bottom tab bar in MVP: six items do not fit a 5-slot bar, and a scrollable bar hides items. If a bottom bar is proposed later, it must be decided here first.
- Touch targets: every control is at least 44x44 CSS px on mobile (`h-11` for buttons, `size-11` for icon buttons, `min-h-11` for table row buttons).
- Tables collapse to stacked cards below `md` (see 6.4, 6.5).

### 4.4 Page header pattern

Every authenticated page except Login starts with the same header block:

```
<h1 class="text-2xl font-semibold tracking-tight">Scheduled</h1>
<p class="text-sm text-muted-foreground">Posts waiting to be published.</p>
                                              →  [ primary action, right aligned ]
```

- Layout: `flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`, then `mb-6`.
- The optional subtitle is one short sentence of `text-sm text-muted-foreground`; it never repeats the title.
- Primary action sits on the right on `sm` and up, and full-width below the title under `sm`.
- Only pages with a genuine primary action render a button: Dashboard, Scheduled and History render "Create post"; Create Post, Connected Accounts, Settings and Login render none.
- Page header height and padding are identical across pages so navigation does not shift layout.

### 4.5 Content container

`mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8`. Cards inside a page stack vertically with `space-y-6`. Two-column grids use `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` (Connected Accounts) and are otherwise avoided — MVP pages are single-column.

### 4.6 Empty-state placement

Empty states render **inside the card or table area they belong to**, never as a full-page takeover and never as a separate route.

- Container: `flex flex-col items-center justify-center gap-3 px-6 py-10 text-center`.
- Icon: `size-10` lucide icon inside a `size-12 rounded-full bg-muted` circle, `text-muted-foreground`.
- Title: `text-base font-medium text-foreground`.
- Body: one sentence, `text-sm text-muted-foreground`, `max-w-sm`.
- Action: exactly one `Button variant="default" size="default"`. A secondary link is allowed only if it navigates to Connected Accounts.
- If only one section of a page is empty (for example Dashboard "Failed posts"), the section still renders with its empty state — never hide the section, and never show a generic "nothing here" for the whole page.

### 4.7 Shell accessibility and state copy

Exact strings for the shell's accessible names and fallback states. They sit here, not in section 6, because they belong to the shell and are identical on every authenticated page.

| String | Where | Mechanism |
| --- | --- | --- |
| "Skip to content" | `AppShell`, first focusable element | `sr-only` link to `#content`, becomes visible on focus (section 9.1) |
| "Navigation" | Mobile nav `Sheet` | `SheetTitle` with `sr-only` |
| "Main navigation" | Sidebar `<nav>` | `aria-label` |
| "Account" | Marketing (landing page) header `<nav>` | `aria-label` (section 6.0) |
| "Signed in" | Header user menu | Fallback label shown when the user's email is unknown |

---

## 5. Status system

Every enum value in `src/lib/db/schema.ts` maps to exactly one badge. The mapping lives in one module (`src/lib/status.ts`) exporting `{ label, tone, icon }` per value; no page hardcodes a label, colour or icon.

Universal rule: **colour is never the only signal.** Every status is rendered as Badge = tone (colour) + lucide icon + text label. Icons are also used without colour in row lists where colour would be noise.

Derived post status follows plan section 29: all platforms success → `published`; some success and some failed → `partial_failure`; all failed → `failed`; waiting for schedule → `scheduled`; in flight → `processing`. The UI never computes this — it reads `posts.status`.

### 5.1 `post_status` (7 values)

| Value | Label | Tone | Icon | Notes |
| --- | --- | --- | --- | --- |
| `draft` | Draft | neutral | `FileText` | Not created by the MVP UI. Render the mapping so the type is exhaustive; no UI flow produces it. |
| `scheduled` | Scheduled | info | `CalendarClock` | Shows the scheduled time next to it. Row action: Cancel. |
| `processing` | Processing | info | `Loader2` (animate-spin) | Publish is async; poll, never assume success. |
| `published` | Published | success | `CheckCircle2` | All selected platforms succeeded. |
| `partial_failure` | Partial failure | warning | `AlertTriangle` | Some platforms succeeded. Detail view lists per-platform results and Retry only on failed ones. |
| `failed` | Failed | danger | `XCircle` | All selected platforms failed. Retry offered per failed platform. |
| `cancelled` | Cancelled | neutral | `Ban` | Terminal. No Retry; the only path forward is "Duplicate" — not in MVP, so show no action. |

### 5.2 `post_platform_status` (4 values)

| Value | Label | Tone | Icon | Notes |
| --- | --- | --- | --- | --- |
| `pending` | Pending | neutral | `Clock` | Queued, not yet picked up by a worker. |
| `processing` | Processing | info | `Loader2` (animate-spin) | Worker has the job. |
| `success` | Success | success | `Check` | Shows "External ID" when available. No Retry. |
| `failed` | Failed | danger | `X` | Shows the human-readable error and a Retry action for this platform only. |

### 5.3 `social_account_status` (3 values)

| Value | Label | Tone | Icon | Notes |
| --- | --- | --- | --- | --- |
| `active` | Connected | success | `CheckCircle2` | Label is "Connected", not "Active" — the enum name is technical. |
| `needs_reconnect` | Needs reconnect | warning | `AlertTriangle` | Always accompanied by an `Alert`: "TikTok needs reconnection." Card shows Reconnect; scheduling to this account is blocked. |
| `disconnected` | Not connected | neutral | `Unlink` | Card shows the Connect action. |

### 5.4 `execution_status` (4 values)

Shown inside the post detail view (per attempt), not in top-level lists.

| Value | Label | Tone | Icon | Notes |
| --- | --- | --- | --- | --- |
| `accepted` | Accepted | neutral | `Inbox` | Platform received the request and will process it asynchronously. Render as: platform "has accepted the post and is still processing". |
| `processing` | Processing | info | `Loader2` (animate-spin) | Worker or platform is still working. |
| `published` | Published | success | `CheckCircle2` | Terminal success; shows "External ID" when present. |
| `failed` | Failed | danger | `XCircle` | Show the mapped human-readable message and the attempt number. |

### 5.5 `platform` (3 values)

Platform indicators are always `neutral` badges. Brand colours are not used, so platform identity is carried by the icon and the name.

| Value | Label | Icon | Fallback icon if brand icon is unavailable | Tone |
| --- | --- | --- | --- | --- |
| `instagram` | Instagram | `Instagram` | `Camera` | neutral |
| `facebook` | Facebook | `Facebook` | `ThumbsUp` | neutral |
| `tiktok` | TikTok | `Music2` | `Video` | neutral |

Order is always Instagram, Facebook, TikTok, matching the Create Post checkbox order and the enum declaration order.

### 5.6 Error message mapping

The UI never prints `error_code`, a raw provider message, or an HTTP status. `src/lib/errors.ts` maps stored error codes to copy; unknown codes fall back to a generic, still human sentence.

| Error condition | UI copy |
| --- | --- |
| Unsupported or rejected media | "TikTok rejected this media format." |
| Media file too large | "This file is too large for TikTok. Try a smaller file." |
| Video too long | "This video is longer than TikTok allows." |
| Caption too long | "This caption is too long for TikTok." |
| Token expired or invalid, or the account needs reconnection | "TikTok needs reconnection. Reconnect the account, then retry." |
| Permission denied | "TikTok denied permission. Reconnect your account to continue." |
| Account disconnected | "This TikTok account is no longer connected." |
| Rate limited | "TikTok is temporarily rate limiting requests. Try again in a few minutes." |
| Timeout or network error | "We couldn't reach TikTok. Retry to publish this post." |
| Invalid or blocked media URL | "Invalid media URL." |
| URL unreachable | "We couldn't reach this URL. Check that it's publicly accessible." |
| Post cancelled | "This post was cancelled and will not be published." |
| Unknown, provider error, or the publish failed | "Something went wrong while publishing to TikTok. Retry to try again." |

Applied by `humanErrorMessage()` (`src/lib/errors.ts`), which substitutes the platform name into the sentence:

- The possible names are `Instagram`, `Facebook`, `TikTok`.
- When no platform is known the fallback subject is `This platform`. Sentences are phrased so the fallback still reads correctly, e.g. `This platform is no longer connected.`, `This platform needs reconnection. Reconnect the account, then retry.`

Rules:

- Copy always names the platform: "Retry TikTok", "TikTok rejected this media format."
- The stored raw error stays in the database for debugging; the UI shows the mapped sentence. A `Tooltip` or expandable "Details" never exposes raw provider responses.
- Message length: one sentence, under 90 characters where possible.

---

## 6. Page-by-page patterns

### 6.0 Landing page (`/`)

`src/app/page.tsx` with `src/components/marketing/*`. The route is **public**: an anonymous visitor must never be redirected to `/login` from here. The landing page is the only page that renders without the app shell (no sidebar, no app header, no page-header pattern). Container: `mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8` with `space-y-8` between sections.

Meta description (from `src/app/layout.tsx`): "Upload once, publish everywhere."

Header — `SiteHeader`, `sticky top-0 z-30`, `h-14`, `border-b border-border bg-background`:

- Brand lockup on the left: "AutoPost" (`text-sm font-semibold`).
- Right `<nav aria-label="Account">`, two `Button`s at `size="sm"`:
  - Anonymous: "Log in" (`ghost`, → `/login`) and "Create post" (`default`, → `/login?next=%2Fcreate-post`).
  - Signed in: "Dashboard" (`ghost`, → `/dashboard`) and "Create post" (`default`, → `/create-post`).
- All four buttons are `h-11` on mobile and `lg:h-9` on desktop.

**Hero** (`LandingHero`) — one `Card`, `<h1>` first:

- `h1`: "Post to Instagram, Facebook and TikTok at once"
- Sub-heading (`text-sm text-muted-foreground`, `max-w-xl`): "Upload once, pick your platforms, then publish now or schedule for later."
- Primary CTA "Create post" (`default`, → the same `createPostHref` as the header button).
- Secondary CTA "See how it works" (`outline`, anchors `#how-it-works`).
- Then `Works with` (`text-xs text-muted-foreground`) followed by the three neutral platform badges (Instagram, Facebook, TikTok) from section 5.5 — neutral tone, no brand colour.

**Features** (`LandingFeatures`) — `<h2>` "What you can do", then exactly three `Card`s (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`), each with a `size-5` `text-muted-foreground` icon, an `<h3>` title and a `text-sm text-muted-foreground` description:

| # | Title | Description |
| --- | --- | --- |
| 1 | "One post, three platforms" | "Send the same caption and photo to Instagram, your Facebook Page and TikTok in one go." |
| 2 | "Publish now or later" | "Post it straight away, or choose a date and time in your own timezone and we'll publish it then." |
| 3 | "See every result" | "Check what happened on each platform, and try again only where it didn't go through." |

**How it works** (`LandingHowItWorks`) — `<section id="how-it-works">` with `scroll-mt-20`, `<h2>` "How it works", then one `Card` holding an ordered list of exactly four steps (numbered badge in a `size-6 rounded-full bg-muted` circle, `aria-hidden="true"`, because the `<ol>` already conveys order):

| # | Title | Description |
| --- | --- | --- |
| 1 | "Connect your accounts" | "Connect Instagram, your Facebook Page and TikTok once, and they stay ready to post." |
| 2 | "Write one caption and add media" | "Add your photo or video, then write the caption you want." |
| 3 | "Choose platforms" | "Pick where this post should go." |
| 4 | "Publish now or schedule" | "Send it straight away, or pick a date and time that suits you." |

**Closing CTA** (`LandingCta`) — one `Card`: `<h2>` "Ready to post?", body "Write your caption once, add your photo or video, and publish it to all three platforms.", then exactly one "Create post" button (`default`, full width below `sm`, `sm:w-auto` above).

The landing page must **not** gain: pricing, testimonials, a logo cloud, stats, a newsletter sign-up, or a cookie banner. It has no footer navigation beyond the brand lockup and global theme toggle in the header.

### 6.1 Login (`/login`)

Layout: full-viewport centred column, no sidebar or header. `min-h-dvh grid place-items-center px-4`, `Card` at `w-full max-w-sm p-6`.

Contents:

- `Card` header: app name (`text-base font-semibold`) and subtitle "Log in to schedule and publish your posts." (`text-sm text-muted-foreground`).
- `Label` + `Input type="email"` "Email", `autoComplete="email"`, `autoFocus`.
- `Label` + `Input type="password"` "Password", `autoComplete="current-password"`.
- `Button variant="default" size="lg"` full width: "Log in". Label becomes "Logging in…" with spinner while pending.

States:

- Inline field errors under the matching input, red `border-destructive`: "Enter a valid email address.", "Password is required."
- Empty-value error, from the server: `Alert variant="destructive"` above the fields — "Enter your email and password." Used when either field arrives empty; it is one sentence for both fields, never one sentence per field.
- Invalid credentials: `Alert variant="destructive"` above the fields — "Incorrect email or password. Try again." Never distinguish unknown-email from wrong-password.
- Network failure: same `Alert`, copy "We couldn't reach the server. Check your connection and try again."
- Rate limited: `Alert` — "Too many attempts. Try again in a few minutes." (login, 5-minute window). Inputs stay enabled.
- Session expired / unauthenticated API call: "Please log in to continue." — the copy returned with `401` from API routes and shown when a session expires. It names no route and no technical cause.
- No password-reset screens in MVP; do not add links to them. Sign-up is available at `/signup`.

Continuation hint: when `next` is not the default route, a `text-xs text-muted-foreground` line renders under the subtitle — "Log in to continue to ${destination}."

| `next` path | `${destination}` |
| --- | --- |
| `/create-post` | Create post |
| `/scheduled` | Scheduled |
| `/history` | History |
| `/connected-accounts` | Connected accounts |
| `/settings` | Settings |
| `/dashboard` | Dashboard |

The destination name is **mapped** from the `next` path by a lookup table; a raw path is never printed. When the path is unknown, or is the default route, the line is omitted entirely — never rendered with a path in it.

Below the card: one `Button variant="ghost" size="sm"` "Back to home" (→ `/`), `text-muted-foreground`. This is the only link out of the login card; the password-reset links remain forbidden.

The 60-second in-app action limiters use a shorter variant of the rate-limit sentence: "Too many attempts. Wait a moment and try again." (cancel, retry, disconnect, save timezone). It is a toast or inline error, not the login `Alert`.

### 6.2 Signup (`/signup`)

Layout: full-viewport centred column, no sidebar or header. `min-h-dvh grid place-items-center px-4`, `Card` at `w-full max-w-sm p-6`.

Contents:

- `Card` header: app name (`text-base font-semibold`) and subtitle "Create your account to start publishing." (`text-sm text-muted-foreground`).
- `Label` + `Input type="email"` "Email", `autoComplete="email"`, `autoFocus`.
- `Label` + `Input type="password"` "Password", `autoComplete="new-password"`.
- `Label` + `Input type="password"` "Confirm password", `autoComplete="new-password"`.
- `Button variant="default" size="lg"` full width: "Create account". Label becomes "Creating account…" with spinner while pending.
- Below the form: centered link row with "Already have an account?" and a `Link` "Log in" → `/login?next=/create-post` (or the original `next` value).

States:

- Inline field errors under the matching input, red `border-destructive`:
  - Email: "Enter a valid email address."
  - Password: "Password is required.", "Password must be at least 8 characters."
  - Confirm password: "Password is required.", "Passwords don't match."
- Page-level `Alert variant="destructive"` above the fields for server errors:
  - "Please choose a different password." (password found in breached database)
  - "We couldn't check this password right now. Try again in a moment." (HIBP API unavailable)
  - "Couldn't create account. Try again." (Supabase error)
  - "Check your email to confirm your account." (email already exists, needs confirmation)
  - "Couldn't create account. Try again." (generic failure)
- Network failure: same `Alert`, copy "We couldn't reach the server. Check your connection and try again."
- Rate limited: `Alert` — "Too many attempts. Try again in a few minutes." (signup, 5-minute window). Inputs stay enabled.
- Client-side validation with react-hook-form + zod (`mode: "onBlur"`, `reValidateMode: "onChange"`). Validate on blur and on submit.

Continuation hint: when `next` is not the default route, a `text-xs text-muted-foreground` line renders under the subtitle — "Log in to continue to ${destination}."

| `next` path | `${destination}` |
| --- | --- |
| `/create-post` | Create post |
| `/scheduled` | Scheduled |
| `/history` | History |
| `/connected-accounts` | Connected accounts |
| `/settings` | Settings |
| `/dashboard` | Dashboard |

The destination name is **mapped** from the `next` path by a lookup table; a raw path is never printed. When the path is unknown, or is the default route, the line is omitted entirely — never rendered with a path in it.

Below the card: one `Button variant="ghost" size="sm"` "Back to home" (→ `/`), `text-muted-foreground`. This is the only link out of the signup card; the login link is in the form footer.

### 6.2 Signup (`/signup`)

Layout: full-viewport centred column, no sidebar or header. `min-h-dvh grid place-items-center px-4`, `Card` at `w-full max-w-sm p-6`.

Contents:

- `Card` header: app name (`text-base font-semibold`) and subtitle "Create your account to start publishing." (`text-sm text-muted-foreground`).
- `Label` + `Input type="email"` "Email", `autoComplete="email"`, `autoFocus`.
- `Label` + `Input type="password"` "Password", `autoComplete="new-password"`.
- `Label` + `Input type="password"` "Confirm password", `autoComplete="new-password"`.
- `Button variant="default" size="lg"` full width: "Create account". Label becomes "Creating account…" with spinner while pending.
- Below the form: centered link row with "Already have an account?" and a `Link` "Log in" → `/login?next=/create-post` (or the original `next` value).

States:

- Inline field errors under the matching input, red `border-destructive`:
  - Email: "Enter a valid email address."
  - Password: "Password is required.", "Password must be at least 8 characters."
  - Confirm password: "Password is required.", "Passwords don't match."
- Page-level `Alert variant="destructive"` above the fields for server errors:
  - "Please choose a different password." (password found in breached database)
  - "We couldn't check this password right now. Try again in a moment." (HIBP API unavailable)
  - "Couldn't create account. Try again." (Supabase error)
  - "Check your email to confirm your account." (email already exists, needs confirmation)
  - "Couldn't create account. Try again." (generic failure)
- Network failure: same `Alert`, copy "We couldn't reach the server. Check your connection and try again."
- Rate limited: `Alert` — "Too many attempts. Try again in a few minutes." (signup, 5-minute window). Inputs stay enabled.
- Client-side validation with react-hook-form + zod (`mode: "onBlur"`, `reValidateMode: "onChange"`). Validate on blur and on submit.

Continuation hint: when `next` is not the default route, a `text-xs text-muted-foreground` line renders under the subtitle — "Log in to continue to ${destination}."

| `next` path | `${destination}` |
| --- | --- |
| `/create-post` | Create post |
| `/scheduled` | Scheduled |
| `/history` | History |
| `/connected-accounts` | Connected accounts |
| `/settings` | Settings |
| `/dashboard` | Dashboard |

The destination name is **mapped** from the `next` path by a lookup table; a raw path is never printed. When the path is unknown, or is the default route, the line is omitted entirely — never rendered with a path in it.

Below the card: one `Button variant="ghost" size="sm"` "Back to home" (→ `/`), `text-muted-foreground`. This is the only link out of the signup card; the login link is in the form footer.

### 6.2 Dashboard (`/dashboard`)

Layout: page header "Dashboard" with primary action "Create post" (`SquarePen` icon) linking to `/create-post`. Then `space-y-6` of three `Card`s. A system banner sits above the cards when any account needs reconnection.

Banner: `Alert` tone `warning` with `AlertTriangle`, plus an inline `Button variant="link"` "Reconnect" → `/connected-accounts`. The title is one sentence built from the comma-joined platform labels:

- One account: "${platform} needs reconnection." — "TikTok needs reconnection."
- Two or three accounts: "${names} need reconnection." — "Instagram, TikTok need reconnection."

Labels come from section 5.5 in the fixed order Instagram, Facebook, TikTok. The banner renders once for all accounts, never one banner per account.

Card 1 — "Upcoming posts" (status `scheduled`, ascending by `scheduled_at`, max 5):

- Row: caption excerpt (`line-clamp-1`, `text-sm font-medium`), meta line `text-xs text-muted-foreground` with "Sep 5, 2026, 8:00 PM" and the IANA timezone abbreviation-free label, then platform badges.
- Components: `Card` + `CardHeader` + `CardContent`, `Badge` (platform, neutral), `Separator` between rows.
- Empty: `CalendarClock` icon, "No scheduled posts", "Create a post and choose a date to see it here.", action "Create post".

Card 2 — "Recent activity" (last 5 posts with a terminal or in-flight status):

- Row: caption excerpt, status `Badge` (section 5.1), relative time in `text-xs text-muted-foreground` ("2 hours ago").
- `processing` rows keep a spinner badge and are the only rows that poll.
- Empty: `History` icon, "No activity yet", "Posts you publish will appear here.", action "Create post".

Card 3 — "Failed posts" (posts with status `failed` or `partial_failure` that still have a failed platform):

- Row structure, matching the plan exactly:
  ```
  Promo C
  Instagram  [x Failed]
  TikTok needs reconnection. Reconnect the account, then retry.        [ Retry ]
  ```
- One row per **failed platform**, not per post: platform badge + `failed` badge, human-readable error sentence, and `Button variant="default" size="sm"` "Retry" (labelled "Retry TikTok" when the post targets more than one platform).
- Retry only the failed platform; never re-publish platforms that already succeeded.
- Empty: `CheckCircle2` icon (success tone, it is a good state), "No failed posts", "Everything you published went through.", no action button.
- If the failure is authentication, "Retry" is disabled with helper "Reconnect TikTok before retrying." and a link to Connected Accounts.

Loading: three `Card`s with `Skeleton` rows matching the real row height (`h-12` per row, 3 rows each).

### 6.3 Create Post (`/create-post`)

Layout: page header "Create post" with subtitle "Write one caption, add media, and publish to your connected accounts." and no action button. One `Card` at `max-w-2xl`, `space-y-6` inside. Full spec of the fields is in section 7.

Structure:

1. **Caption** — `Label` "Caption" + `Textarea` (`min-h-32`, `resize-y`) + counter and platform limit hint.
2. **Media** — `Label` "Media" + `Tabs` with two triggers: "Upload file" and "Paste URL".
3. **Publish to** — `Label` "Publish to" + three `Checkbox` rows.
4. **Footer** — `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`: `Button variant="secondary"` "Schedule", `Button variant="default"` "Publish now". Under `sm`, both are full-width and "Publish now" sits on top.

States:

- Default: "Publish now" disabled until a caption, media, and at least one compatible connected platform are present.
- Publishing: both buttons disabled, "Publishing…" with spinner; the form is not reset; on success, `toast.success("Publishing to 3 platforms…")` is **not** used — instead navigate to the post detail in History with a "Processing" status. See section 8.4.
- Schedule: opens `Dialog` titled "Schedule post" with description "Choose the date, time and timezone for this post.", date, time, timezone, resolved-UTC helper, and confirm `Button` "Schedule post". On success: `toast.success("Post scheduled for Sep 5, 2026, 8:00 PM.")` then navigate to `/scheduled`.
- Validation errors: inline, under the offending field, with the section-7 copy. A page-level `Alert variant="destructive"` is used only for server errors ("We couldn't upload this file. Check your connection and try again.").
- No connected accounts: the "Publish to" group renders an `Alert variant="warning"`: "Connect an account to publish." with a `Button variant="link"` "Connect account" → `/connected-accounts`; both footer buttons are disabled.
- Disabled-button reason: the footer shows one `text-xs text-muted-foreground` sentence explaining why "Publish now" is disabled (section 3.1). The full set of reasons, in priority order: "Connect an account to publish.", "Add media to continue.", "No selected platform supports this media.", "Checking media…", "Caption is too long.", "Select at least one platform.", "Write a caption to continue."
- "Add media" is the label of the submit button on the "Paste URL" tab (section 7.2); it is `secondary` and sits beside the URL input.

Server-rejected copy, shown in the page-level `Alert variant="destructive"` (it replaces the placeholder example above; never more than one sentence at a time):

| Condition | Copy |
| --- | --- |
| Unhandled server error | "We couldn't create this post. Try again." |
| Publish/schedule rate limited | "Too many posts at once. Wait a moment and try again." |
| The same platform was sent twice | "Choose one account per platform." |
| The account row is gone | "We couldn't find that account. Reconnect it and try again." |
| An account was disconnected between selection and submit | "Your Instagram account is no longer connected." — "Your" plus the platform name; the raw enum slug is never interpolated. |

### 6.4 Scheduled (`/scheduled`)

Layout: page header "Scheduled" with subtitle "Posts waiting to be published." and primary action "Create post".

Body: one `Card` with `CardHeader` "Scheduled posts" and, on `md` and up, a `Table`:

| Column | Content |
| --- | --- |
| Post | Caption excerpt, `line-clamp-2`, `max-w-md` |
| Scheduled | `Sep 5, 2026, 8:00 PM` (`tabular-nums`) + `text-xs text-muted-foreground` `Asia/Jakarta` |
| Platforms | Platform badges, `gap-1`, wrap |
| Status | `scheduled` badge, or `processing`/`cancelled` if it changed |
| Actions (right, `text-right`) | `Button variant="ghost" size="sm"` "Cancel", and a `DropdownMenu` (`MoreHorizontal`, `size-8`) is **not** used — one action per row is enough |

Below `md`: the table is replaced by stacked `Card`s (`space-y-3`) with the same data in label/value rows and a full-width "Cancel" button.

Actions and states:

- "Cancel" opens a `Dialog`: title "Cancel scheduled post?", body "This post will not be published. You can create it again.", confirm `Button variant="destructive"` "Cancel post", cancel `Button variant="outline"` "Keep scheduled".
- Cancel is optimistic (section 8.4): the row disappears immediately with a toast "Post cancelled." and an "Undo" action; on failure the row returns and a destructive toast explains why.
- Empty: `CalendarClock` icon, "Nothing scheduled", "Schedule a post and it will appear here with its publish time.", action "Create post".
- Loading: `Skeleton` table — header row plus five `h-12` rows.
- Error: `Alert variant="destructive"` inside the card with "We couldn't load your scheduled posts." and `Button variant="outline" size="sm"` "Try again".

### 6.5 History (`/history`)

Layout: page header "History" with subtitle "Everything you published or tried to publish." and primary action "Create post".

Body: `Table` (`md` and up) inside a `Card`:

| Column | Content |
| --- | --- |
| Post | Caption excerpt, `line-clamp-2`, `max-w-md` |
| Date | Published time if set, otherwise created time — `Sep 5, 2026, 8:00 PM` with `tabular-nums` |
| Status | `post_status` badge (section 5.1) |
| Platforms | Platform badges; a failed platform renders its platform badge immediately followed by a `failed` badge |
| Actions | `Button variant="ghost" size="sm"` "View" |

Post detail (a `Dialog` below `md`, an inline expanded panel or dedicated row content above it) — this is where per-platform results live, exactly as the plan specifies:

```
Promo September

Instagram   [✓ Success]      External ID: 1792…
Facebook    [✓ Success]      External ID: 102…
TikTok      [x Failed]       TikTok rejected this media format.
                                                    [ Retry TikTok ]
```

- Each platform row: platform name with icon, status badge from section 5.2, then either `External ID: <value>` in `text-xs text-muted-foreground font-mono` with a copy `Button variant="ghost" size="icon"` (`Copy`, `aria-label="Copy external ID"`), or the human-readable error sentence.
- "External ID" is the only user-facing internal identifier; it is labelled exactly that, never "external_post_id".
- Retry button appears only on `failed` platform rows and is labelled "Retry" when the row context is unambiguous, "Retry TikTok" in the post-level summary. Retry never re-runs `success` platforms.
- Attempt history (from `post_executions`) is shown as `text-xs text-muted-foreground`. Never show `error_code`.
- Empty: `History` icon, "No posts yet", "Your published and scheduled posts will show up here.", action "Create post".
- Loading: skeleton rows.

Card header title: "Posts" (`text-base font-medium`, inside `CardHeader`).

Load failure: card-level `Alert variant="destructive"` with `AlertTitle` "We couldn't load your posts." and an inline `Button variant="outline" size="sm"` "Try again" that refreshes the route. It replaces the table and the empty state, never both.

Row toggle: the "View" button becomes "Hide" while the row is expanded (`Button variant="ghost" size="sm"`), linking back to `/history`.

Mobile detail: below `md` the detail is a `Dialog` whose `DialogTitle` is `sr-only` "Post details"; the panel content is identical to the inline panel above `md`.

Attempt-history format: one clause per attempt, joined with `" · "` (space, middle dot, space). Every clause carries its own total, in the form `Attempt ${n} of ${max} ${outcome}`:

- `${outcome}` is `succeeded` (execution `published`), `failed` (execution `failed`), or `is still processing` (execution `accepted` or `processing`).
- Real rendering: `Attempt 1 of 3 failed · Attempt 2 of 3 failed · Attempt 3 of 3 succeeded`.
- The shorter example "Attempt 2 of 3 failed · Attempt 3 succeeded" is **illustrative only** — production repeats `of ${max}` on every clause, including the last.
- `is still processing` reads correctly at the end of a sentence: "Attempt 2 of 3 is still processing".

Retry failure: a failed retry shows the inline sentence "We couldn't retry this platform. Try again." next to the platform row (`text-xs text-destructive`), not a toast.

Copying an External ID: `toast.success("External ID copied.")` on success, `toast.error("We couldn't copy this ID. Copy it manually.")` when the clipboard is unavailable.

Polling the post detail (`/api/posts/[id]`) can fail; those two sentences are shown in place of the detail panel:

- "We couldn't find that post." — the post is gone or not yours.
- "We couldn't load this post. Try again." — any other failure.

### 6.6 Connected Accounts (`/connected-accounts`)

Layout: page header "Connected accounts" with subtitle "Connect the accounts you want to publish to.", **no** primary action (the actions live on each card).

Body: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, one `Card` per platform in fixed order Instagram, Facebook, TikTok. Three cards always render, including unconnected platforms.

Card content:

- Header row: platform icon (`size-5`, `text-muted-foreground`) + platform name (`text-base font-medium`) on the left; status `Badge` on the right.
- Identity row: `Avatar` (`size-9`, `avatarUrl` when available, fallback initials) + account name — `@username` for Instagram and TikTok, the page name for Facebook Page — in `text-sm`, with `text-muted-foreground` "Not connected" when there is no account.
- Actions row (`flex flex-wrap gap-2`):
  - No account / `disconnected`: `Button variant="default" size="sm"` "Connect".
  - `active`: `Button variant="outline" size="sm"` "Reconnect" and `Button variant="danger" size="sm"` "Disconnect".
  - `needs_reconnect`: `Alert variant="warning"` inside the card — "TikTok needs reconnection. Scheduled posts to this account will fail until you reconnect." — then `Button variant="default" size="sm"` "Reconnect" and `Button variant="danger" size="sm"` "Disconnect".
- No card-level metadata (no token expiry dates, no scopes, no "last validated" timestamps, no permission lists).

Connect / Reconnect flow: the button is a link to the server OAuth route; while the redirect is in flight the button shows "Connecting…" with a spinner. On return, `?connected=tiktok` renders `toast.success("TikTok connected.")` and `?error=...` renders a destructive toast with the mapped copy ("We couldn't connect TikTok. Try again.").

Disconnect flow: `Button variant="danger"` opens a `Dialog` — title "Disconnect TikTok?", body "Scheduled posts to this account will fail. You can reconnect at any time.", confirm `Button variant="destructive"` "Disconnect", cancel `Button variant="outline"` "Keep connected". After confirming, the card optimistically flips to "Not connected" with a toast "TikTok disconnected." plus "Undo"; on failure the card restores and a destructive toast appears.

Not-configured helper: when a platform has no server credentials, the Connect/Reconnect button is disabled and a `text-xs text-muted-foreground` line renders under the actions — "${subject} isn't set up on this server yet."

- `${subject}` is `Instagram`, `Facebook` or `TikTok` when the platform is identified: "TikTok isn't set up on this server yet."
- When no platform is identified the fallback subject is `the account`, capitalised at the start of the sentence: "The account isn't set up on this server yet."

Rollback copy, in descending order of specificity — the most specific message the server gave wins:

| Condition | Copy |
| --- | --- |
| Named platform, generic failure | "Couldn't disconnect ${platform}. Try again." — "Couldn't disconnect TikTok. Try again." |
| Action-level fallback (unhandled failure) | "Couldn't disconnect this account. Try again." |
| The account row is gone | "We couldn't find that account." |

Loading: three skeleton cards (`h-40`). No page-level empty state — the three cards always exist.

### 6.7 Settings (`/settings`)

Layout: page header "Settings", no primary action. A single `Card` at `max-w-2xl`, `space-y-6`.

Contents — account only, nothing else:

- "Account" section: read-only email value with `Label` "Email" and an `Input` that is `readOnly disabled` and `text-muted-foreground`.
- "Default timezone" section: `Label` "Default timezone" + `Select` of IANA zones (the same list used by the schedule dialog), with helper text "Used as the starting timezone when you schedule a post." The `SelectValue` placeholder is "Select a timezone", shown until a zone is stored. Saving uses `Button variant="secondary" size="sm"` "Save" (label becomes "Saving…" while pending) and a success toast "Timezone saved."; a failed save shows `toast.error("We couldn't save your timezone. Try again.")`.
- "Session" section: `Button variant="outline"` "Log out".

Explicitly not present: notification settings, profile editing, password change, billing, danger-zone account deletion, API keys, webhook configuration. Light and dark mode are controlled by the global header toggle and persisted in the browser.

### 6.8 Shared: 404 and error boundaries

- `not-found.tsx` inside the app shell: page header "Page not found", `Card` with "This page doesn't exist." and `Button variant="default"` "Go to dashboard".
- `error.tsx` per route group: `Card` with `Alert variant="destructive"` — `AlertTitle` "Something went wrong." and `AlertDescription` "Try again, or go back to your dashboard." — followed by `Button variant="outline"` "Try again" (calls `reset()`) and `Button variant="ghost"` "Go to dashboard".
- The description never names the error, the route, or a technical cause; "Try again" and the dashboard link are the only two paths offered.

---

## 7. Forms and validation

All forms use react-hook-form with zod schemas from `src/lib/validation/`. Server-side validation is authoritative; the client schema mirrors it so users get immediate feedback. Validation errors are inline; toasts report outcomes, never field errors.

### 7.1 Caption

- `Textarea` with `min-h-32`, `max-h-96`, `resize-y`, `placeholder="Write your caption…"`.
- Character counter, right-aligned under the field: `text-xs text-muted-foreground`, format `1,234 / 2,200`.
- The effective limit is the **minimum** across the selected platforms, computed from shared constants in `src/lib/validation/limits.ts` — never hardcoded in the component:
  | Platform | Caption limit | Verify against provider docs before shipping |
  | --- | --- | --- |
  | Instagram | 2,200 | yes |
  | Facebook Page | 63,206 | yes |
  | TikTok | 2,200 | yes |
- Counter states: under 90% → `text-muted-foreground`; 90–100% → `text-[hsl(var(--warning))]`; over limit → `text-destructive` and the textarea border becomes `border-destructive`.
- Limit hint under the counter, `text-xs text-muted-foreground`: "Instagram and TikTok allow up to 2,200 characters." The hint names only the platforms constraining the current limit.
- Over-limit behaviour: footer buttons disabled, error text "Caption is too long for TikTok. Remove 42 characters." — no auto-truncation, ever.
- Empty caption on submit: "Write a caption before publishing." (the same sentence is the server's authoritative message). The disabled-button reason is the shorter "Write a caption to continue." (section 6.3).
- The over-limit sentence is built from a template, so both number forms exist: "Remove 42 characters." and, when the caption is exactly one character over, "Remove 1 character." Never "Remove 1 characters."
- One caption for all platforms in MVP; no per-platform caption field, no character-count-per-platform matrix.

### 7.2 Media

MVP rule: **one media per post.** After a media item is added, the dropzone is replaced by the preview; there is no "add another".

Tabs:

- "Upload file" — dropzone: `rounded-lg border-2 border-dashed border-border`, `min-h-40`, centred column, `UploadCloud` icon (`size-8 text-muted-foreground`), "Drag and drop an image or video, or click to browse" (`text-sm`), and "JPEG, PNG, WebP, MP4 or MOV · up to 100 MB" (`text-xs text-muted-foreground`). Click and Enter/Space open the file picker; drag-over sets `border-primary bg-accent/50`.
- "Paste URL" — `Input type="url" inputMode="url"` with placeholder `https://…` and helper "The URL must be publicly accessible and use HTTPS." The `Label` is `sr-only` "Media URL" (the helper text carries the visible guidance). The submit button beside the input is "Add media" (`secondary`), which becomes "Adding…" while the URL is being fetched.
- The empty tab keeps its own state; adding media from either tab switches the card to preview mode.

Preview:

- Row: `rounded-lg overflow-hidden` thumbnail (`size-20`, `object-cover`, video shows a `Play` overlay), then filename (`text-sm font-medium`, `truncate`), meta (`text-xs text-muted-foreground`: "2.4 MB · 1920x1080 · 0:14"), then `Button variant="ghost" size="icon"` with `X`, `aria-label="Remove media"`.
- Upload in progress: `Progress` bar replaces the meta line, with "Uploading… 42%" in `text-xs`; remove is disabled during upload. The `Progress` bar carries `aria-label="Upload progress"`.
- Validation errors (inline, `text-xs text-destructive` under the control): "This file type isn't supported. Use JPEG, PNG, WebP, MP4 or MOV.", "This file is too large. Maximum size is 100 MB.", "Invalid media URL.", "Only HTTPS URLs are supported.", "We couldn't reach this URL. Check that it's publicly accessible."

Upload and storage failures — one sentence each, shown inline under the media control or as a toast for the media API routes:

| Failure | Copy |
| --- | --- |
| Upload request failed | "We couldn't upload this file. Check your connection and try again." |
| Storage bucket could not be prepared | "We couldn't prepare media storage. Try again." |
| Stored or fetched media could not be read | "We couldn't read this media file. Try uploading it again." |
| Media probe failed on a URL or an upload | "We couldn't check this media. Try uploading it again." |
| Compatibility request failed for another reason | "We couldn't check this media. Try again." |
| Upload rate limited | "Too many uploads. Wait a moment and try again." |

### 7.3 Platform selection

- `Checkbox` group, one row per platform, in fixed order. Row layout: `flex items-center justify-between gap-3 rounded-md border border-border p-3`, checkbox + icon + platform name on the left, status on the right.
- Connected account name is shown under the platform name (`text-xs text-muted-foreground`, e.g. `@username`), so the user knows where the post will land.
- Default state: all connected and compatible platforms are **checked** — the fastest path is the default.
- Unchecked rows are still fully legible (never `opacity-50` on the label text; use `text-muted-foreground` only on the helper line).

Disabled states — each one states the reason and the fix:

| Condition | Checkbox | Helper text |
| --- | --- | --- |
| No connected account for the platform | disabled | "Connect TikTok to publish there." + `Button variant="link" size="sm"` "Connect" |
| Account is `needs_reconnect` | disabled | "TikTok needs reconnection." + `Button variant="link" size="sm"` "Reconnect" |
| Media incompatible with the platform | disabled, and unchecked | `AlertTriangle` + "Media format is not supported." in warning colour |
| No media selected yet | enabled; validation runs on submit | "Add media before publishing." (shown only after a submit attempt) |

Compatibility is checked **before** scheduling (plan section 13): the moment media is selected or changed, incompatible platform checkboxes disable and explain. A post is never scheduled to a platform that is known to be incompatible. While the check is in flight, incompatible-undetermined platforms show `Loader2` and are disabled with "Checking media…".

If no platform can accept the media: `Alert variant="warning"` above the footer — "No selected platform supports this media. Try a different file." and both footer buttons are disabled.

The full sentence "No selected platform supports this media. Try a different file." is **canonical** — it is the copy used in the warning `Alert`. The truncated form "No selected platform supports this media." is used only in the disabled-button `TooltipContent` (and as the disabled-button reason in section 6.3), where there is no room for the second clause. Never invent a third variant.

If the compatibility check itself fails for one platform, that platform's checkbox stays disabled with the helper "We couldn't check ${platform} right now. Try again." — `Instagram`, `Facebook` or `TikTok` substituted ("We couldn't check TikTok right now. Try again."). The other platforms are unaffected and remain selectable.

### 7.4 Date, time, timezone (Schedule dialog)

`Dialog` titled "Schedule post":

- Date: `Popover` + `Calendar`, trigger is `Button variant="outline"` showing "Sep 5, 2026" with `CalendarDays` icon; `disabled={{ before: today }}`.
- Time: `Select` of 15-minute increments (96 options), default 09:00, values shown in the user's selected timezone.
- Timezone: `Select` labelled "Timezone", populated with IANA identifiers (`Asia/Jakarta`, `Asia/Singapore`, `America/New_York`, …), defaulting to the browser's guessed zone or the Settings default. Labels read `Asia/Jakarta (GMT+7)` — the IANA identifier is the stored value, the offset is display-only.
- Helper text under the timezone, `text-xs text-muted-foreground`, always visible and updated on every change:
  "Publishes at Sep 5, 2026, 1:00 PM UTC · 8:00 PM your time (Asia/Jakarta)."
- The `scheduled_at` value sent to the server is the resolved UTC instant; `timezone` carries the IANA identifier. The client shows the resolved UTC so the user can verify the conversion before confirming (plan section 16).
- Confirm `Button variant="default"` "Schedule post"; cancel `Button variant="outline"` "Cancel".
- Inline error for a past date/time: "Choose a time in the future."
- Field errors, from the shared schedule schema (`src/lib/validation/schemas.ts`): "Choose a valid date.", "Choose a valid time.", "Choose a timezone." Each sits under its own control, `aria-describedby`, `aria-invalid="true"` (section 7.5).
- No recurrence, no "post at optimal time", no draft-saving, no queue slots.

### 7.5 Error display rules

| Situation | Mechanism | Example |
| --- | --- | --- |
| Field-level validation | Inline `text-xs text-destructive` under the field, `aria-describedby`, `aria-invalid="true"`, `border-destructive` on the control | "Invalid media URL." |
| Form-wide validation (submit blocked) | `Alert variant="destructive"` at the top of the form, focus moved to it | "Select at least one platform." |
| Server rejected the request | `Alert variant="destructive"` in the form, with retryable wording | "We couldn't upload this file. Check your connection and try again." |
| Async action succeeded | `toast.success` | "Post scheduled for Sep 5, 2026, 8:00 PM." |
| Async action failed | `toast.error` with a "Try again" action button | "Couldn't schedule this post. Try again." |

Validation timing: validate a field on blur and on submit, not on every keystroke. Validate on change only after the field has already been marked invalid, so the error clears as soon as it is fixed. Toasts never contain field-level validation messages.

---

## 8. States: empty, loading, error, success

### 8.1 Loading

- Never a full-page spinner. The shell (sidebar, header, page header) renders immediately; only the data region is loading.
- Lists and tables: `Skeleton` matching the real layout — same container, same row count (5), same row height (`h-12`), `rounded-md`, `bg-muted`.
- Cards: `Skeleton` with the card's real height (`h-40` for account cards) so nothing shifts.
- Text: `Skeleton` lines at `h-4` with widths 60–90% of the real line.
- Buttons: inline spinner inside the clicked control, plus `disabled`. A global loading bar is not used.
- Anything still loading after 10 seconds shows a `text-xs text-muted-foreground` note: "Still loading…", and after 30 seconds an `Alert` with "Try again".
- Images and media previews: `Skeleton` at the exact thumbnail size, then fade in; no layout jump.

### 8.2 Empty

Per section 4.6: icon in a muted circle, title, one-sentence body, exactly one primary CTA. Copy is per page (section 6) — never a generic "No data". An empty state never includes a secondary action other than a link to Connected Accounts when accounts are the blocker.

### 8.3 Error

- Region-level: `Alert variant="destructive"` inside the affected card, with `AlertCircle` icon, a human sentence, and `Button variant="outline" size="sm"` "Try again". The surrounding page stays usable.
- Row-level: the row keeps its data and shows the error sentence plus a scoped action ("Retry TikTok").
- Page-level (route `error.tsx`): full-region `Alert` with "Try again" and "Go to dashboard".
- Errors never show: HTTP status codes, stack traces, provider payloads, tokens, internal IDs other than External ID, or the word "error" followed by a code.
- Destructive-but-expected outcomes (a failed publish) are **not** errors — they are statuses with their own tone and copy (section 5).

### 8.4 Optimistic updates — allowed and forbidden

Publishing is asynchronous: the HTTP request only enqueues work; a worker performs the publish. The UI must never claim success it has not confirmed.

Optimistic UI is **allowed** for reversible, synchronous-ish state changes:

| Action | Optimistic behaviour | Rollback |
| --- | --- | --- |
| Cancel scheduled post | Row disappears immediately | Row returns; destructive toast "Couldn't cancel this post. Try again." |
| Disconnect account | Card flips to "Not connected" | Card restores; destructive toast "Couldn't disconnect TikTok. Try again." |
| Remove media from the composer | Preview disappears, dropzone returns | Preview restores; inline error |

Optimistic UI is **forbidden** for anything that depends on a social platform:

| Action | Required behaviour |
| --- | --- |
| Publish now | Create the post, navigate to the History detail, show `processing` (spinner) badges, and poll. Never show "Published" until `post_platforms.status` is `success`. |
| Scheduled post reaching its time | The list shows `processing`; poll until terminal. |
| Retry | Button becomes "Retrying…" then the platform row returns to `processing`; poll. |
| Connect / Reconnect (OAuth) | Redirect; no optimistic "Connected" state. |

Polling rules:

- Poll the affected post (or list) every 5 seconds while any row is `processing` or any platform is `accepted`/`processing`.
- Stop after 2 minutes (24 attempts) and show a neutral `Alert`: "Still publishing. We'll keep trying — refresh to check the latest status." The status stays `processing`; it is never flipped to `failed` or `published` by the client.
- Stop polling when the tab is hidden (`document.visibilityState`) and refresh immediately on refocus.
- Use `aria-live="polite"` on the status region so the change is announced (section 9).

### 8.5 Success

- Toast for the outcome of an action the user initiated: "Post scheduled for Sep 5, 2026, 8:00 PM.", "TikTok disconnected.", "Timezone saved."
- In-place status change for async work: badge becomes `Published` with `CheckCircle2`; no toast is fired for a publish that completes during polling unless the user is still on the page, in which case a single `toast.success("Published to Instagram.")` is acceptable.
- Success is never celebrated with a full-page interstitial, confetti, or modal.
- Toasts: `sonner`, bottom-right on desktop, top-centre on mobile, maximum 3 visible, default 4 seconds, destructive toasts 6 seconds.

---

## 9. Accessibility

### 9.1 Keyboard

- Every interactive element is reachable with Tab and operable with Enter (buttons, links) or Space (checkboxes, buttons).
- Tab order follows visual order: skip link → sidebar → header → page header → content. No positive `tabindex`.
- `Dialog` and `Sheet` trap focus, close on Escape, and return focus to the triggering element (shadcn/Radix provides this; do not override it).
- `DropdownMenu` supports arrow keys, Home/End, and type-ahead; `Select` and `Tabs` follow the same expectations.
- The dropzone is a real `<button type="button">` or carries `tabindex="0"` with `role="button"` and Enter/Space handlers.
- Roving focus is not used; every row action is a real, focusable button.

### 9.2 Focus visibility

- Never `outline-none` without adding a focus ring (section 2.8).
- Focus ring is always 2px with a 2px offset on `--background`, so it is visible on cards, `muted` surfaces, and `destructive` buttons.
- Custom controls (`Checkbox` uses the shadcn default; the dropzone and platform rows) must show the same ring.
- Focus is never hidden behind the sticky header; add `scroll-mt-20` to focusable anchors.

### 9.3 Contrast

- Body and label text: minimum 4.5:1 against its surface. This is why `--muted-foreground` and the custom `--destructive` values are specified as they are.
- Icons and borders that carry meaning: minimum 3:1 against their surface.
- Placeholder text may be 3:1 minimum, but every field also has a persistent visible `Label`.
- Never place text on an image, a media thumbnail, or a gradient.
- Status badge text uses the tone's text colour on the tone's surface colour, both defined in 2.2 for light and dark.

### 9.4 Forms, labels and ARIA

- Every control has a visible `<Label>` with `htmlFor` matching the control's `id`. No placeholder-as-label.
- Helper text and error text are linked with `aria-describedby`; invalid controls get `aria-invalid="true"`.
- Required fields are marked with a `text-destructive` asterisk plus `sr-only` "(required)"; in MVP all Create Post fields except media are required.
- Groups use `fieldset`/`legend` or `role="group"` with `aria-labelledby` (the "Publish to" checkbox group is a `role="group"` labelled "Publish to").
- A disabled control that is disabled for a reason keeps that reason in `aria-describedby`, and stays focusable where possible so screen readers and `Tooltip` users can reach the explanation.
- Checkbox state changes are announced by the native control; no custom `aria-checked` in MVP.

### 9.5 Async status and live regions

- The publish status region on the post detail is `role="status" aria-live="polite"`, wrapping the platform status badges. Status changes are announced as "TikTok: Processing", "TikTok: Failed. TikTok rejected this media format."
- The character counter is `aria-live="polite"` but throttled: announce only when the limit is within 50 characters or exceeded.
- Toasts are rendered by `sonner` in a polite live region; a destructive toast that blocks an action also sets `role="alert"`.
- Polling updates never steal focus and never move the scroll position.
- Spinners are decorative: `<Loader2 className="animate-spin" aria-hidden="true" />` with the real state in adjacent text, and `prefers-reduced-motion` replaces the spin with a static `Clock` icon.

### 9.6 Touch targets and pointer input

- Minimum 44x44 CSS px on mobile, 36x36 on desktop (per-button sizes in 3.1).
- Icon-only buttons always carry an accessible name via `aria-label` ("Remove media", "Copy external ID", "Open navigation", "Account menu", "More actions").
- Adjacent destructive and non-destructive actions are separated by at least `gap-2` and never placed as the only two options in a 44px band without a confirm step.
- Hover-only interactions (tooltips, hover reveals) always have a keyboard and touch equivalent; no action is reachable only by hover.

### 9.7 Never convey state by colour alone

Every status is a Badge with tone **plus** icon **plus** text (section 5). In addition:

- Error text is never red-only; it sits with an `AlertCircle`/`AlertTriangle` icon and a sentence.
- Inline validation uses border colour, error text, and `aria-invalid`.
- Required/optional and selected/unselected states use labels and checkmarks, not colour.
- Platform identity uses icon and name, never brand colour.
- Charts are not used in MVP, so no colour-encoded data visualisation exists.

---

## 10. Do / Don't

| Do | Don't |
| --- | --- |
| Keep the flow visible: upload → pick platform → publish/schedule → done. | Add a step, a wizard, or a settings detour before the first publish. |
| One primary action per screen ("Publish now", "Create post", "Connect"). | Put two competing primary buttons in the same view. |
| Use the six nav items exactly: Dashboard, Create Post, Scheduled, History, Connected Accounts, Settings. | Add a seventh item, a submenu, or a "more" overflow in the sidebar. |
| Show each platform's result separately with its own status badge. | Collapse three platform outcomes into one overall word. |
| Say "TikTok rejected this media format." | Say "HTTP 400", "error_code: invalid_media", or dump a provider payload. |
| Show "Processing" with a spinner and poll until confirmed. | Show "Published" right after the submit request returns. |
| Retry only the platforms that failed. | Retry the whole post and duplicate successful publishes. |
| Disable an incompatible platform checkbox and say why, before scheduling. | Let an incompatible platform fail later inside the worker. |
| Pair every status colour with an icon and a text label. | Use a coloured dot, a coloured border, or colour-only text as the signal. |
| Put validation errors next to the field that caused them. | Put field errors in a toast or a modal. |
| Use toasts for outcomes of actions ("Post scheduled for Sep 5, 8:00 PM."). | Use toasts for validation, for confirmations, or more than one per action. |
| Keep surfaces flat: 1px borders, elevation only on floating layers. | Add drop shadows to cards, gradients, glows, or tinted shadows. |
| Use the semantic tokens (`bg-card`, `text-muted-foreground`). | Use raw palette classes (`bg-zinc-50`, `text-gray-400`) or inline hex values. |
| Show the resolved UTC time under the timezone picker. | Store or display `GMT+7` / `UTC+7` as the source of truth. |
| Write copy a non-technical user understands. | Use "webhook", "queue", "job", "execution", "OAuth", "payload", "idempotent". |
| Confirm every disconnect and cancel in a dialog. | Disconnect or cancel on a single click with no confirmation. |
| Keep Settings to email, default timezone, and log out; keep theme mode in the global header toggle. | Add notification settings, billing, profile editing, or API keys. |
| Ship one caption and one media per post. | Build carousel, multiple media, or per-platform captions. |
| Render empty states inside the section they belong to. | Replace the whole page with a full-screen empty state. |
| Skeleton the real layout at real heights. | Ship a centred full-page spinner for data loading. |

### 10.1 Defensive copy (not reachable through the UI)

These three strings exist in the code as **guards** for input the UI cannot produce. They are recorded here — deliberately outside every inventory above — so a reviewer recognises them as guards and does not mistake them for user-facing copy:

- "Unsupported platform." — emitted when a platform value fails the enum check.
- "TikTok is not configured." — emitted when TikTok credentials are missing.
- "Meta is not configured." — emitted when Meta credentials are missing.

They are guards, not copy. Their technical wording is acceptable **only** because they are unreachable through any normal flow. If any of them ever becomes reachable, it must be rewritten in plain language before it can ship to a user.

---

## Appendix A — Copy reference

Button labels (exact strings):

| String | Where | Variant |
| --- | --- | --- |
| "Create post" | Dashboard, Scheduled, History page headers | default |
| "Publish now" | Create Post footer | default |
| "Schedule" | Create Post footer | secondary |
| "Schedule post" | Schedule dialog confirm | default |
| "Retry" | Dashboard failed row, History failed platform | default (sm) |
| "Retry TikTok" | History post detail, multi-platform failure | default (sm) |
| "Cancel" | Schedule dialog, Disconnect dialog, Cancel dialog | outline |
| "Cancel post" | Cancel scheduled post dialog confirm | destructive |
| "Connect" | Connected Accounts card, inline link in Create Post | default |
| "Reconnect" | Connected Accounts card, needs-reconnect alert | outline / default |
| "Disconnect" | Connected Accounts card trigger / dialog confirm | danger / destructive |
| "Remove" | Media preview (icon-only, `aria-label="Remove media"`) | ghost icon |
| "Upload file" / "Paste URL" | Media Tabs triggers | tabs |
| "Log out" | Settings, header user menu | outline / menu item |
| "Try again" | Error alerts and toasts | outline (sm) |
| "Save" | Settings timezone | secondary (sm) |
| "Add media" | "Paste URL" tab submit | secondary |
| "Log in" | Landing page header (anonymous) | ghost |
| "Dashboard" | Landing page header (signed in) | ghost |
| "See how it works" | Landing page hero, anchors `#how-it-works` | outline |
| "Back to home" | Below the login card, → `/` | ghost (sm) |
| "Hide" | History row, expanded state (pairs with "View") | ghost (sm) |

Status labels (exact strings, from section 5): Draft, Scheduled, Processing, Published, Partial failure, Failed, Cancelled; Pending, Success; Connected, Needs reconnect, Not connected; Accepted.

Empty-state titles: "No scheduled posts", "No activity yet", "No failed posts", "Nothing scheduled", "No posts yet".

Dialog titles: "Schedule post", "Cancel scheduled post?", "Disconnect TikTok?", "Log in".

Dialog descriptions: "Choose the date, time and timezone for this post.", "This post will not be published. You can create it again.", "Scheduled posts to this account will fail. You can reconnect at any time."

Toast strings: "Post scheduled for Sep 5, 2026, 8:00 PM.", "Post cancelled.", "TikTok disconnected.", "TikTok connected.", "Timezone saved.", "External ID copied.", "Couldn't schedule this post. Try again.", "Couldn't cancel this post. Try again.", "Couldn't disconnect TikTok. Try again.", "Couldn't disconnect this account. Try again.", "We couldn't copy this ID. Copy it manually.", "We couldn't save your timezone. Try again.", "Too many attempts. Wait a moment and try again.", "Too many uploads. Wait a moment and try again.", "Too many posts at once. Wait a moment and try again."

Note: "Still publishing. We'll keep trying — refresh to check the latest status." is **not** a toast. It is a neutral `Alert` (`AlertTitle` "Still publishing." + `AlertDescription`) shown when polling gives up after 2 minutes (section 8.4). It is deliberately kept out of the toast list.

Inline failure sentences (rendered in an `Alert` or beside the control, never as a toast): "We couldn't load your scheduled posts.", "We couldn't load your posts.", "We couldn't load this post. Try again.", "We couldn't find that post.", "We couldn't find that account.", "We couldn't find that account. Reconnect it and try again.", "We couldn't create this post. Try again.", "We couldn't retry this platform. Try again.", "Please log in to continue.", "Enter your email and password.", "Choose one account per platform.", "Your Instagram account is no longer connected.", "Instagram needs reconnection.", "Instagram, TikTok need reconnection.", "TikTok isn't set up on this server yet.", "The account isn't set up on this server yet.", "We couldn't check TikTok right now. Try again."

Loading-button labels: "Publishing…", "Scheduling…", "Retrying…", "Connecting…", "Logging out…", "Saving…", "Disconnecting…", "Adding…".

Accessibility and sr-only copy: "Skip to content", "Navigation", "Main navigation", "Account" (marketing nav), "Media URL", "Upload progress", "Post details", "Signed in".
