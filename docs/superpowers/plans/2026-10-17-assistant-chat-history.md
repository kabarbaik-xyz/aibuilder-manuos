# Assistant recent history and operation header

- [x] Remove repeated fallback status badge and detached AI explanation from operation header.
- [x] Persist completed server-authoritative answers via executeCommand, isolated by workspace and membership.
- [x] Restore20 recent exchanges chronologically; scope fingerprint hides answers after access changes.
- [x] Preserve context and verified evidence references; show load/retry state and historical snapshot notice.
- [x] Update API contract, apply local migration after backup and restart dev server.
- [x] Isolated history integration tests2/2 passed; local authenticatedGET200/anonymous401; whitespace and layout detector passed.
- [x] Final typecheck passed after regeneration of Prisma client.

History starts with new exchanges after deployment; earlier in-memory chats cannot be recovered. This restores messages, not multi-turn model memory.20 is the retained history projection; command receipts/audit retain normal transactional evidence. No commit/push.
