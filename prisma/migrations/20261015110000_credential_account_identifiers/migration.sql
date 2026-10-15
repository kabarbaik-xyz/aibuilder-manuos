-- Better Auth credential login matches account_id to the stable user ID.
-- Repair legacy email identifiers without changing password hashes or sessions.
-- A pre-existing canonical credential account already enables login; retain any
-- redundant legacy row rather than colliding with the provider/account unique key.
UPDATE accounts
SET account_id = user_id
WHERE provider_id = 'credential'
  AND account_id <> user_id
  AND account_id = (SELECT email FROM users WHERE users.id = accounts.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM accounts AS canonical
    WHERE canonical.provider_id = 'credential'
      AND canonical.account_id = accounts.user_id
      AND canonical.id <> accounts.id
  );
