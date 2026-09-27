DROP INDEX seat_username_invites_license_idx;
DROP TABLE seat_username_invites;

ALTER TABLE products DROP COLUMN license_terms_template;
ALTER TABLE products DROP COLUMN license_type;
