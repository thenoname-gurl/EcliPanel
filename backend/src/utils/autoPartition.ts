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

async function ensureMysqlPartitions(table: string, log: any): Promise<void> {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const endMonth = new Date(now.getFullYear() + 1, 11, 1);
  const months: Date[] = [];
  for (let cursor = new Date(startMonth); cursor <= endMonth; cursor = nextMonth(cursor)) {
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
    await createInitialMysqlPartitions(table, months, log);
    return;
  }

  for (const m of missing) {
    const name = partitionName(m);
    const bound = formatDate(nextMonth(m));
    try {
      await AppDataSource.query(
        `ALTER TABLE \`${table}\` ADD PARTITION (PARTITION \`${name}\` VALUES LESS THAN (TO_DAYS(?)))`,
        [bound],
      );
      log?.info({ table, partition: name, bound }, 'auto-partition: created');
    } catch (err: any) {
      log?.warn({ table, partition: name, err }, 'auto-partition: add failed');
    }
  }
}

async function createInitialMysqlPartitions(
  table: string,
  months: Date[],
  log: any,
): Promise<void> {
  const parts = months
    .map(m => {
      const name = partitionName(m);
      const bound = formatDate(nextMonth(m));
      return `PARTITION \`${name}\` VALUES LESS THAN (TO_DAYS('${bound}'))`;
    })
    .join(',\n');

  const [row] = await AppDataSource.query(`SELECT 1 AS ok FROM \`${table}\` LIMIT 1`);
  if (row) {
    log?.info({ table }, 'auto-partition: skipping non-empty table (partition manually during maintenance)');
    return;
  }

  const sql = `ALTER TABLE \`${table}\` PARTITION BY RANGE (TO_DAYS(timestamp))
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