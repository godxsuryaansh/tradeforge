# Economy Expansion + Tickets Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expanded economy actions and a full ticket system (multi-ticket, big embeds, ticket member management, owner-editable ticket panel) with Firestore persistence.

**Architecture:** Keep `/economy` as the primary surface and extend Firestore `guilds/{guildId}.economy` to include action settings + per-user timestamps. Replace the ad-hoc ticket flow in `src/bot/index.ts` with a dedicated tickets module plus `/ticket` and `/ticketpanel` commands, persisting ticket metadata in `guilds/{guildId}/tickets/{ticketId}` and guild-level ticket settings in `guilds/{guildId}.tickets`.

**Tech Stack:** Node.js, TypeScript (ESM), discord.js v14, Firestore (firebase client SDK).

---

## File Map (what changes where)

**Economy**
- Modify: `src/lib/firebase-admin.ts` (EconomySettings actions config; Wallet timestamps; service helpers)
- Modify: `src/bot/commands/economy.ts` (add: work/beg/crime/gamble/slots + config setters)
- Modify: `src/bot/commands/help.ts` (help list updates)

**Tickets**
- Create: `src/bot/tickets.ts` (button handlers + helpers)
- Create: `src/bot/commands/ticket.ts` (in-ticket management commands + `/ticket open`)
- Create: `src/bot/commands/ticketpanel.ts` (owner-only panel customization + send/update/view)
- Modify: `src/lib/firebase-admin.ts` (ticket services + settings)
- Modify: `src/bot/index.ts` (remove old inline ticket logic; wire new commands + init)
- Modify: `src/bot/commands/setup.ts` (optionally keep `/setup-ticket-panel` as a thin wrapper over `/ticketpanel send`)

---

### Task 1: Firestore models and services

**Files:**
- Modify: `src/lib/firebase-admin.ts`

- [ ] **Step 1: Extend economy types and defaults**

Add to `EconomySettings`:
```ts
actions: {
  work: { enabled: boolean; min: number; max: number; cooldownMs: number };
  beg: { enabled: boolean; min: number; max: number; cooldownMs: number };
  crime: { enabled: boolean; successChance: number; winMin: number; winMax: number; loseMin: number; loseMax: number; cooldownMs: number };
  gamble: { enabled: boolean; winChance: number; cooldownMs: number };
  slots: { enabled: boolean; cooldownMs: number };
};
```
Ensure `DEFAULT_ECONOMY_SETTINGS` contains sane defaults (as in the design spec).

- [ ] **Step 2: Extend wallet timestamps**

Add to `Wallet`:
```ts
lastWorkAt: string | null;
lastBegAt: string | null;
lastCrimeAt: string | null;
lastGambleAt: string | null;
lastSlotsAt: string | null;
```
Update `getWallet()` to read those fields, and update `DEFAULT_WALLET`.

- [ ] **Step 3: Add ticket settings + ticket service**

Add new interfaces:
```ts
export interface TicketSettings {
  panelTitle: string;
  panelDescription: string;
  buttonLabel: string;
  buttonEmoji: string | null;
  categoryId: string | null;
  staffRoleId: string | null;
  logChannelId: string | null;
  panelMessageId: string | null;
  panelChannelId: string | null;
  closeMode: 'delete';
}

export interface TicketRecord {
  ticketId: string;
  channelId: string;
  ownerId: string;
  createdBy: string;
  createdAt: string;
  status: 'open' | 'closed';
  participants: string[];
  claimedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
}
```

Implement:
- `ticketSettingsService.getSettings(guildId)`
- `ticketSettingsService.updateSettings(guildId, patch)`
- `ticketService.createTicket(guildId, record)`
- `ticketService.getByChannelId(guildId, channelId)`
- `ticketService.updateTicket(guildId, ticketId, patch)`

- [ ] **Step 4: Verify types compile**

Run:
```bash
npm run lint
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/firebase-admin.ts
git commit -m "feat: add economy actions + ticket services"
```

---

### Task 2: Economy action commands (+ admin config)

**Files:**
- Modify: `src/bot/commands/economy.ts`
- Modify: `src/bot/commands/help.ts`

- [ ] **Step 1: Add new subcommands**

Add builder subcommands:
- `work`, `beg`, `crime`
- `gamble amount:int`, `slots amount:int`
Add config subcommands under `economy config` to set enabled/ranges/cooldowns (keep minimal but complete).

- [ ] **Step 2: Implement cooldown helper**

Add local helper:
```ts
function cooldownRemainingMs(lastIso: string | null, cooldownMs: number): number {
  if (!lastIso) return 0;
  const last = Date.parse(lastIso);
  if (!Number.isFinite(last)) return 0;
  const now = Date.now();
  return Math.max(0, last + cooldownMs - now);
}
```
Use the wallet timestamp fields to enforce cooldowns.

- [ ] **Step 3: Implement actions**

Use `economyService.adjustBalances(...)` for wallet deltas and patch the appropriate `lastXAt` timestamp on success (or attempt).
All responses are orange embeds.

- [ ] **Step 4: Update help list**

Add:
- `/economy work/beg/crime/gamble/slots`

- [ ] **Step 5: Verify**
```bash
npm run lint
```

- [ ] **Step 6: Commit**
```bash
git add src/bot/commands/economy.ts src/bot/commands/help.ts
git commit -m "feat: economy actions (work/beg/crime/gamble/slots)"
```

---

### Task 3: Tickets module (buttons + utilities)

**Files:**
- Create: `src/bot/tickets.ts`
- Modify: `src/bot/index.ts`

- [ ] **Step 1: Implement ticket panel builder**

In `src/bot/tickets.ts` implement:
```ts
export function buildTicketPanel(settings: TicketSettings) { /* embed + open_ticket button */ }
```

- [ ] **Step 2: Implement open/close button handlers**

Handle customIds:
- `open_ticket` → create channel, set perms, write ticket record, send big embed
- `close_ticket` → permission check, log, mark closed, delete channel

Ensure button handlers **defer quickly** and always reply.

- [ ] **Step 3: Wire `initTickets()`**

Export `initTickets()` that registers an `interactionCreate` listener and handles only ticket-related buttons.

- [ ] **Step 4: Remove old ticket button branches**

In `src/bot/index.ts`, remove:
- inline `ticketCommand` object (move to command file)
- `open_ticket` / `close_ticket` branches
and call `initTickets()` during bot init.

- [ ] **Step 5: Verify**
```bash
npm run lint
```

- [ ] **Step 6: Commit**
```bash
git add src/bot/tickets.ts src/bot/index.ts
git commit -m "feat: tickets button handling + init"
```

---

### Task 4: `/ticket` and `/ticketpanel` commands

**Files:**
- Create: `src/bot/commands/ticket.ts`
- Create: `src/bot/commands/ticketpanel.ts`
- Modify: `src/bot/index.ts`
- (Optional) Modify: `src/bot/commands/setup.ts`

- [ ] **Step 1: Add `/ticket`**

Commands:
- `/ticket open` (creates a ticket like the panel)
- `/ticket add-user <member>`
- `/ticket remove-user <member>`
- `/ticket close [reason]`
- `/ticket claim`
- `/ticket rename <name>`

Ticket context: require this be run inside a ticket channel (lookup ticket by channelId).

- [ ] **Step 2: Add `/ticketpanel` (owner-only)**

Subcommands:
- `view`
- `send <channel>`
- `update` (edit last sent panel message if stored)
- `set-title`, `set-description`, `set-button`, `set-emoji`
- `set-category`, `set-staff-role`, `set-log-channel`

- [ ] **Step 3: Wire command registration**

Import and add to `commands[]` in `src/bot/index.ts`.

- [ ] **Step 4: (Optional) Make `/setup-ticket-panel` call `/ticketpanel send`**

Keep backwards compatibility but route behavior through the new panel builder.

- [ ] **Step 5: Verify**
```bash
npm run lint
```

- [ ] **Step 6: Commit**
```bash
git add src/bot/commands/ticket.ts src/bot/commands/ticketpanel.ts src/bot/index.ts src/bot/commands/setup.ts
git commit -m "feat: ticket commands + owner ticket panel"
```

---

### Task 5: Push + runtime smoke check

**Files:**
- None (verification + deploy)

- [ ] **Step 1: Push**
```bash
git push
```

- [ ] **Step 2: Local smoke check**

Run:
```bash
npm run dev
```
Expected:
- Server health: `GET /api/health` returns `{"status":"ok"}`
- Bot logs in and registers commands without crashing

