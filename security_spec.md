# Firestore Security Specification (Phase 0)

## Data Invariants
1. A user document at `/users/{userId}` can only be read or written by `{userId}` (or a verified admin), and clients may NEVER self-assign `role == 'admin'` on creation or escalate `role` on update.
2. A business profile at `/business_profiles/{userId}` is strictly bound to `request.auth.uid == userId` and `incoming().userId == request.auth.uid`, with immutable `createdAt` and server timestamp `request.time`.
3. A conversation at `/conversations/{conversationId}` can only be accessed if `resource.data.userId == request.auth.uid`.
4. A message at `/conversations/{conversationId}/messages/{messageId}` can only be accessed if the parent `/conversations/{conversationId}` exists AND belongs to `request.auth.uid` (Master Gate relational sync).
5. A checklist at `/checklists/{checklistId}` can only be accessed if `resource.data.userId == request.auth.uid`.
6. A checklist item at `/checklists/{checklistId}/items/{itemId}` can only be accessed if the parent `/checklists/{checklistId}` exists AND belongs to `request.auth.uid` (Master Gate relational sync).
7. Saved research items at `/saved_items/{savedId}` are strictly scoped to `userId == request.auth.uid`.
8. Feedback documents at `/feedback/{feedbackId}` can be created by their owner (`userId == request.auth.uid`) and read only by their owner or a verified admin (`isAdmin()`).
9. Admin markers at `/admins/{userId}` are immutable to clients (`allow write: if false;`) and `isAdmin()` checks `/admins/$(request.auth.uid)` ONLY when `request.auth.token.email_verified == true`.

## The Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. Unauthenticated read/list on `/users/uid1`, `/conversations`, `/checklists`, `/saved_items`.
2. Privilege escalation on user creation: `POST /users/uid1` with `{ role: "admin", ... }`.
3. Privilege escalation on user update: `PATCH /users/uid1` changing `role` from `"user"` to `"admin"`.
4. Shadow update / ghost field injection: `PATCH /users/uid1` with `{ full_name: "X", isVerified: true }` (blocked by `affectedKeys().hasOnly(...)`).
5. Identity spoofing on business profile: User A creating `/business_profiles/uidB` or setting `userId: "uidB"`.
6. Orphaned message creation: User A creating `/conversations/convBelongingToUserB/messages/msg1`.
7. Orphaned checklist item creation: User A creating `/checklists/listBelongingToUserB/items/item1`.
8. Cross-user list query scraping: User A querying `/conversations` or `/saved_items` without matching `userId == request.auth.uid`.
9. Resource poisoning / Denial-of-Wallet ID: Creating `/conversations/<1500_char_junk_id>` (blocked by `isValidId`).
10. Field size poisoning: Setting `conversation.title` or `saved_items.title` to a 5,000-character string or `citations` array > 20 items.
11. Timestamp forgery: Setting `createdAt` or `updatedAt` to `"2099-01-01T00:00:00Z"` instead of `request.time`.
12. Email spoofing for admin access: Authenticating with an unverified account matching the admin email (`email_verified == false`) and reading `/feedback`.
