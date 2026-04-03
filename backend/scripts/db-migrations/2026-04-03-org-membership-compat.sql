SET @has_role := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'organisation_member'
    AND column_name = 'role'
);

SET @add_role_sql := IF(
  @has_role = 0,
  'ALTER TABLE `organisation_member` ADD COLUMN `role` varchar(255) NOT NULL DEFAULT ''member''',
  'SELECT 1'
);
PREPARE stmt FROM @add_role_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_org_role := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'organisation_member'
    AND column_name = 'orgRole'
);

SET @backfill_role_sql := IF(
  @has_org_role > 0,
  'UPDATE `organisation_member` SET `role` = COALESCE(NULLIF(`orgRole`, ''''), `role`, ''member'')',
  'SELECT 1'
);
PREPARE stmt FROM @backfill_role_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `organisation_member`
  MODIFY COLUMN `role` varchar(255) NOT NULL DEFAULT 'member';

SET @has_canonical_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'organisation_member'
    AND index_name = 'IDX_9cc288407803dda762f27cb481'
    AND non_unique = 0
);

SET @create_unique_sql := IF(
  @has_canonical_unique = 0,
  'CREATE UNIQUE INDEX `IDX_9cc288407803dda762f27cb481` ON `organisation_member` (`userId`, `organisationId`)',
  'SELECT 1'
);
PREPARE stmt FROM @create_unique_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;