import { AppDataSource } from '../config/typeorm';

const PARTITION_TABLES = [
  'soc_data',
  'api_request_log',
  'user_log',
  'node_heartbeat',
  'telemetry_event',
  'notification',
  'admin_audit_entry',
  'outbound_email',
  'chat_message',
  'security_finding',
];

function nextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function partitionName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `p${y}_${m}`;
}

type MysqlPartitionMeta = {
  partitionColumn: string;
  hasPkOnPartitionColumn: boolean;
  hasAnyForeignKeys: boolean;
  pkColumns: string[];
};

type PartitionRangeBounds = {
  start: Date;
  end: Date;
};

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

async function getMysqlPartitionMeta(table: string): Promise<MysqlPartitionMeta | null> {
  const columns: { column_name: string }[] = await AppDataSource.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [table],
  );

  const columnNames = new Set(columns.map(c => c.column_name));
  const partitionColumn = ['timestamp', 'createdAt', 'created', 'detectedAt'].find(c =>
    columnNames.has(c),
  );

  if (!partitionColumn) return null;

  const pkCols: { column_name: string }[] = await AppDataSource.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.key_column_usage
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'`,
    [table],
  );

  const pkColumns = pkCols.map(c => c.column_name);

  const hasPkOnPartitionColumn = pkColumns.includes(partitionColumn);

  const [fkOut] = await AppDataSource.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.key_column_usage
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table],
  );

  const [fkIn] = await AppDataSource.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.key_column_usage
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = ?`,
    [table],
  );

  const hasAnyForeignKeys = Number(fkOut?.cnt ?? 0) > 0 || Number(fkIn?.cnt ?? 0) > 0;

  return {
    partitionColumn,
    hasPkOnPartitionColumn,
    hasAnyForeignKeys,
    pkColumns,
  };
}

async function ensureMysqlPrimaryKeyIncludesPartitionColumn(
  table: string,
  meta: MysqlPartitionMeta,
  log: any,
): Promise<boolean> {
  if (meta.hasPkOnPartitionColumn) return true;

  const keyColumns = meta.pkColumns.length > 0 ? [...meta.pkColumns] : ['id'];
  if (!keyColumns.includes(meta.partitionColumn)) {
    keyColumns.push(meta.partitionColumn);
  }

  const keySql = keyColumns.map(c => quoteIdent(c)).join(', ');
  const hasPrimaryKey = meta.pkColumns.length > 0;
  const sql = hasPrimaryKey
    ? `ALTER TABLE ${quoteIdent(table)} DROP PRIMARY KEY, ADD PRIMARY KEY (${keySql})`
    : `ALTER TABLE ${quoteIdent(table)} ADD PRIMARY KEY (${keySql})`;

  try {
    await AppDataSource.query(sql);
    log?.info({ table, keyColumns }, 'auto-partition: primary key updated to include partition column');
    return true;
  } catch (err: any) {
    log?.warn({ table, keyColumns, err }, 'auto-partition: failed to update primary key');
    return false;
  }
}

async function getMysqlPartitionRangeBounds(table: string, partitionColumn: string): Promise<PartitionRangeBounds> {
  const [row] = await AppDataSource.query(
    `SELECT MIN(${quoteIdent(partitionColumn)}) AS min_value, MAX(${quoteIdent(partitionColumn)}) AS max_value
       FROM ${quoteIdent(table)}`,
  );

  const now = new Date();
  const defaultStart = monthStart(new Date(now.getFullYear(), now.getMonth() - 3, 1));
  const defaultEnd = monthStart(new Date(now.getFullYear() + 1, 11, 1));

  const minValue = row?.min_value ? new Date(row.min_value) : null;
  const maxValue = row?.max_value ? new Date(row.max_value) : null;

  const dataStart = minValue ? monthStart(new Date(minValue.getFullYear(), minValue.getMonth() - 1, 1)) : null;
  const dataEnd = maxValue ? monthStart(new Date(maxValue.getFullYear(), maxValue.getMonth() + 2, 1)) : null;

  const start = dataStart && dataStart < defaultStart ? dataStart : defaultStart;
  const end = dataEnd && dataEnd > defaultEnd ? dataEnd : defaultEnd;

  return { start, end };
}

async function getMysqlPartitionExpression(table: string): Promise<string | null> {
  const rows: { partition_expression: string | null }[] = await AppDataSource.query(
    `SELECT PARTITION_EXPRESSION AS partition_expression
       FROM information_schema.partitions
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND PARTITION_NAME IS NOT NULL
      LIMIT 1`,
    [table],
  );

  const expr = rows?.[0]?.partition_expression;
  return expr ? String(expr) : null;
}

async function ensureMysqlPartitions(table: string, log: any): Promise<void> {
  let meta = await getMysqlPartitionMeta(table);
  if (!meta) {
    log?.info({ table }, 'auto-partition: skipped (no compatible datetime column)');
    return;
  }

  if (!meta.hasPkOnPartitionColumn) {
    await ensureMysqlPrimaryKeyIncludesPartitionColumn(table, meta, log);
    meta = await getMysqlPartitionMeta(table);
    if (!meta?.hasPkOnPartitionColumn) {
      log?.info(
        { table, column: meta?.partitionColumn },
        'auto-partition: skipped (primary key must include partition column)',
      );
      return;
    }
  }

  if (meta.hasAnyForeignKeys) {
    log?.info({ table }, 'auto-partition: skipped (foreign keys present)');
    return;
  }

  const { start, end } = await getMysqlPartitionRangeBounds(table, meta.partitionColumn);
  const months: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = nextMonth(cursor)) {
    months.push(new Date(cursor));
  }

  const existing: { partition_name: string }[] = await AppDataSource.query(
    `SELECT PARTITION_NAME AS partition_name
       FROM information_schema.partitions
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND PARTITION_NAME IS NOT NULL`,
    [table],
  );

  const existingNames = new Set(existing.map(r => r.partition_name));
  const missing = months.filter(m => !existingNames.has(partitionName(m)));

  if (missing.length === 0) return;

  if (existingNames.size === 0) {
    await createInitialMysqlPartitions(table, meta.partitionColumn, months, log);
    return;
  }

  const partitionExpression = await getMysqlPartitionExpression(table);
  const useToDays = partitionExpression?.toUpperCase().includes('TO_DAYS(') ?? false;

  for (const m of missing) {
    const name = partitionName(m);
    const bound = formatDate(nextMonth(m));
    try {
      if (useToDays) {
        await AppDataSource.query(
          `ALTER TABLE \`${table}\` ADD PARTITION (PARTITION \`${name}\` VALUES LESS THAN (TO_DAYS(?)))`,
          [bound],
        );
      } else {
        await AppDataSource.query(
          `ALTER TABLE \`${table}\` ADD PARTITION (PARTITION \`${name}\` VALUES LESS THAN (?))`,
          [bound],
        );
      }
      log?.info({ table, partition: name, bound }, 'auto-partition: created');
    } catch (err: any) {
      log?.warn({ table, partition: name, err }, 'auto-partition: add failed');
    }
  }
}

async function createInitialMysqlPartitions(
  table: string,
  partitionColumn: string,
  months: Date[],
  log: any,
): Promise<void> {
  const parts = months
    .map(m => {
      const name = partitionName(m);
      const bound = formatDate(nextMonth(m));
      return `PARTITION \`${name}\` VALUES LESS THAN ('${bound}')`;
    })
    .join(',\n');

  const sql = `ALTER TABLE \`${table}\` PARTITION BY RANGE COLUMNS(\`${partitionColumn}\`)
(${parts})`;

  try {
    await AppDataSource.query(sql);
    log?.info({ table, count: months.length }, 'auto-partition: initialized');
  } catch (err: any) {
    log?.warn({ table, err }, 'auto-partition: init failed (may need PK adjustment)');
  }
}

async function ensurePostgresPartitions(table: string, log: any): Promise<void> {
  const now = new Date();
  const months: Date[] = [];
  let cursor = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 7, 1);
  while (cursor < end) {
    months.push(new Date(cursor));
    cursor = nextMonth(cursor);
  }

  for (const m of months) {
    const name = partitionName(m);
    const start = formatDate(m);
    const end_ = formatDate(nextMonth(m));
    try {
      await AppDataSource.query(
        `CREATE TABLE IF NOT EXISTS "${table}_${name}"
         PARTITION OF "${table}"
         FOR VALUES FROM ('${start}') TO ('${end_}')`,
      );
    } catch (err: any) {
      log?.warn({ table, partition: name, err }, 'auto-partition: pg failed');
    }
  }
}

export async function ensureAutoPartitions(log?: any): Promise<void> {
  if (!AppDataSource.isInitialized) return;

  const dbType = String(AppDataSource.options.type || '');
  const isMysql = dbType === 'mysql' || dbType === 'mariadb';
  const isPostgres = dbType === 'postgres';

  if (!isMysql && !isPostgres) return;

  for (const table of PARTITION_TABLES) {
    try {
      if (isMysql) {
        await ensureMysqlPartitions(table, log || console);
      } else if (isPostgres) {
        await ensurePostgresPartitions(table, log || console);
      }
    } catch {
      // sakure/cherry blosom is soo cool
    }
  }
}

export function scheduleAutoPartitionMaintenance(log?: any): void {
  const { schedule } = require('./cron');
  schedule('0 3 1 * *', () => {
    ensureAutoPartitions(log || console).catch(() => {});
  });
}
