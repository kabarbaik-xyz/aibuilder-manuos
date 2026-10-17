# Profile detail revamp

Scope: all technician/person detail tabs and commercial contact details, preserving existing permissions and server commands.

- [x] Bound detail content to 1200px; compact shared section spacing and responsive records.
- [x] Group linked-account identity and status; make account action intrinsic width.
- [x] Tighten skills/certifications, weekly calendar, availability, swaps and bookings.
- [x] Replace distant customer contact rows with responsive label/value columns; compact status; centered edit modal.
- [x] Resolve local supervisor query failure: backup SQLite, apply pending recovery-foundations migration, regenerate Prisma, restart dev server.
- [x] Typecheck, whitespace and layout detector.

Evidence: exact reported membership endpoint returned 500 before schema/client synchronization and 200 afterward with membership data. Technician route returned HTTP200. Final typecheck passed; layout detector returned no findings. Browser inspection was interrupted by changing active Chrome windows and a ScreenCaptureKit error, so final desktop/mobile visual verification remains unavailable. No commit/push.
