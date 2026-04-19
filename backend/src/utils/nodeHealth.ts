import { AppDataSource } from '../config/typeorm';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';

export const NODE_HEALTH_MAX_AGE_MS = 120_000;

export async function getLastNodeHeartbeats(): Promise<Map<number, { status: string; timestamp: Date }>> {
  const repo = AppDataSource.getRepository(NodeHeartbeat);
  const table = repo.metadata.tableName;
  const rows: Array<{ nodeId: number; status: string; timestamp: Date | string }> = await repo.query(
    `SELECT hb.nodeId AS nodeId, hb.status AS status, hb.timestamp AS timestamp
      FROM ${table} hb
      INNER JOIN (
        SELECT nodeId, MAX(timestamp) AS maxTimestamp
        FROM ${table}
        GROUP BY nodeId
      ) latest ON hb.nodeId = latest.nodeId AND hb.timestamp = latest.maxTimestamp`
  );

  const latest = new Map<number, { status: string; timestamp: Date }>();
  for (const row of rows) {
    const nodeId = Number(row.nodeId);
    latest.set(nodeId, {
      status: String(row.status),
      timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
    });
  }

  return latest;
}

export async function getUnhealthyNodeIds(maxAgeMs = NODE_HEALTH_MAX_AGE_MS): Promise<number[]> {
  const latest = await getLastNodeHeartbeats();
  const now = Date.now();
  const unhealthy: number[] = [];

  for (const [nodeId, heartbeat] of latest.entries()) {
    if (heartbeat.status !== 'ok' || now - heartbeat.timestamp.getTime() > maxAgeMs) {
      unhealthy.push(nodeId);
    }
  }

  return unhealthy;
}