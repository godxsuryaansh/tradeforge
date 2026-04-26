# TradeForge Bot - Economy Expansion + Tickets Revamp (Design)

Date: 2026-04-26

## Goals

1. Expand the economy with common "earn/spend/risk" actions while keeping anti-abuse safeguards.
2. Replace the existing ticket flow with a full ticket system:
   - Allows multiple tickets per user
   - Uses embed-first UX (orange theme)
   - Adds commands to manage ticket members
   - Adds owner-only panel customization commands
3. Persist settings + ticket state in Firestore.

## Non-goals

- Implement a full inventory/consumables system beyond the existing "shop role reward" mechanism.
- Implement payments beyond the existing `/economy pay`.

## Current State (Observed)

- Economy exists with wallet balance and message-earnings; bank balance is newly added.
- Ticket creation exists in `src/bot/index.ts` and deletes ticket channel on `close_ticket` button; lacks persistent metadata and member management.

## Economy Expansion - Command Surface

All commands respond with **embeds only** (orange theme) and use per-user cooldowns + sanity checks.

### User Commands

- `/economy work`
  - Earn random amount
  - Defaults: min=20, max=80, cooldown=30m
- `/economy beg`
  - Earn small random amount
  - Defaults: min=1, max=15, cooldown=10m
- `/economy crime`
  - Risk action
  - Defaults: successChance=0.45, winMin=50, winMax=200, loseMin=10, loseMax=50, cooldown=45m
- `/economy gamble <amount>`
  - Bet an amount from wallet
  - Defaults: winChance=0.49 (house edge), payout=2x on win, cooldown=30s
- `/economy slots <amount>`
  - Slot-style multipliers; uses wallet
  - Defaults: cooldown=15s, low chance of big multiplier

### Admin / Owner Commands

Add to existing `/economy config`:

- Enable/disable each action command
- Set cooldowns and ranges (min/max, chances)

Owner-only:

- `/economy destroy` remains owner-only destructive operation.

### Data Model (Firestore)

Under `guilds/{guildId}`:

- `economy` settings:
  - Existing fields (currencyName, dailyAmount, earnPerMessage, messageEarningsEnabled, etc.)
  - New action settings:
    - `actions.work.enabled`, `actions.work.min`, `actions.work.max`, `actions.work.cooldownMs`
    - Same structure for `beg`, `crime`, `gamble`, `slots`
- Per-user wallets: `guilds/{guildId}/economy/{userId}`
  - Existing `balance`, `bank`, timestamps
  - New timestamps for action cooldowns:
    - `lastWorkAt`, `lastBegAt`, `lastCrimeAt`, `lastGambleAt`, `lastSlotsAt` (ISO strings or null)

## Tickets Revamp - UX & Rules

### Ticket Panel

Panel message:
- Big orange embed with title, description, "what to include", and rules
- One button: "Open Ticket"

Panel must be configurable by **server owner**:
- Title, description, button label, emoji, category channel (optional), staff role (optional), log channel (optional)
- `/ticketpanel send <channel>`

### Ticket Creation

When a user opens a ticket:
- Create a new channel with unique name: `ticket-<username>-<shortid>`
- Place under configured category if provided
- Permission overwrites:
  - Everyone: no view
  - Ticket creator: view + send
  - Staff role (if configured): view + send
  - Server owner: always view + manage
  - Bot: required permissions

Inside ticket channel:
- Send a “big” orange embed:
  - Ticket Owner
  - How to proceed
  - Buttons: Close (and optionally “Transcript” later)
- Ping the staff role if configured (optional)

### Ticket Commands (in-ticket)

Allow **multiple tickets per user**; therefore ticket identification is per-channel.

Commands:
- `/ticket add-user <member>`
- `/ticket remove-user <member>`
- `/ticket close [reason]`
- `/ticket claim` (staff)
- `/ticket rename <name>` (optional)

Permissions:
- Ticket owner OR staff role OR server owner can:
  - add/remove users
  - close ticket
- Claim/rename: staff role or server owner

### Ticket Storage (Firestore)

Under `guilds/{guildId}/tickets/{ticketId}`:

Fields:
- `ticketId`
- `channelId`
- `ownerId`
- `createdBy`
- `createdAt`
- `status`: `open` | `closed`
- `closedAt`, `closedBy`, `closeReason`
- `participants`: array of userIds (owner + added members)
- `claimedBy`: userId|null

Also store panel settings at `guilds/{guildId}.tickets` (guild-level config):
- `panelTitle`, `panelDescription`, `buttonLabel`, `buttonEmoji`
- `categoryId`, `staffRoleId`, `logChannelId`

### Logs

Log these actions (embed to log channel if configured, else existing log mechanism):
- Ticket created
- User added/removed
- Ticket claimed
- Ticket closed (reason + actor)

## Implementation Notes / Constraints

- Keep all interactions resilient (no "application didn't respond"): defer replies quickly and wrap handlers in try/catch.
- Use consistent orange embed theme (`0xFF6321` / `0xff6321`).
- Avoid blocking operations in the interaction thread; store minimal data and proceed.

## Acceptance Criteria

Economy:
- New commands work, enforce cooldowns, update balances correctly, configurable by admin.

Tickets:
- Ticket panel can be customized by server owner.
- Users can open multiple tickets; each creates a unique channel.
- Ticket owner can add/remove users with slash commands.
- Close ticket logs and cleans up channel (delete or archive per config; default delete).
