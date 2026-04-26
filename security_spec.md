# Security Specification - TradeForge Bot

## Data Invariants
1. A user's profile can only be modified by the system (bot) or the user themselves (only specific fields like bio).
2. Vouches are immutable once created and can only be created by authenticated users for other users.
3. Trust levels are system-calculated and cannot be modified by users.

## The Dirty Dozen (Potential Attack Payloads)
1. Setting `trustLevel` to "HIGH" directly via client SDK.
2. Incrementing `totalDeals` without actual trades.
3. Deleting other users' vouches.
4. Mass-creating vouches (spam).
5. Injecting 1MB strings into the `bio` field.
6. Spoofing `userId` in the profile document.
7. Modifying `joinDate`.
8. Creating a vouch for themselves.
9. Accessing PII if it were stored.
10. Rapidly updating bio to bypass cooldowns (if implemented in rules).
11. Injecting script tags in `bio` (XSS - though rules can't block this easily, length limits help).
12. Listing all users via a blanket query.

## Test Runner (Draft)
- `test('deny profile spoofing', ...)`
- `test('deny direct trust level update', ...)`
- `test('allow bio update for owner', ...)`
