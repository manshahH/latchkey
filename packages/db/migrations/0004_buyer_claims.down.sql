DROP INDEX auth_states_expires_idx;
DROP INDEX claims_license_expires_idx;
DROP TABLE auth_states;

ALTER TABLE sessions DROP COLUMN csrf_token_hash;
ALTER TABLE claims DROP COLUMN last_sent_at;
ALTER TABLE claims DROP COLUMN created_at;
