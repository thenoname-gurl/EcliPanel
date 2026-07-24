ALTER TABLE elo_project ADD COLUMN moderation_status VARCHAR(32) NOT NULL DEFAULT 'active';
ALTER TABLE elo_project ADD COLUMN moderation_note TEXT NULL;
ALTER TABLE elo_project ADD COLUMN disqualified_at DATETIME NULL;
ALTER TABLE elo_project ADD COLUMN disqualified_by INT NULL;