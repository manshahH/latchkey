DROP TABLE github_invite_attempts;
DROP TABLE github_webhook_deliveries;
DROP INDEX github_installations_seller_account_idx;
ALTER TABLE github_installations DROP COLUMN updated_at;
ALTER TABLE github_installations DROP COLUMN installed_at;
ALTER TABLE github_installations DROP COLUMN permissions;
ALTER TABLE github_installations DROP COLUMN account_id;