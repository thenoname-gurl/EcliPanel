import { AppDataSource } from '../config/typeorm';
import { Node } from '../models/node.entity';
import { NodeHeartbeat } from '../models/nodeHeartbeat.entity';

export async function publicRoutes(app: any, prefix = '') {
  const nodeRepo = () => AppDataSource.getRepository(Node);
  const hbRepo = () => AppDataSource.getRepository(NodeHeartbeat);

  app.get(prefix + '/public/status', async (ctx: any) => {
    const nodes = await nodeRepo().find();
    const total = nodes.length;
    const now = new Date();

    let online = 0;
    let degraded = 0;
    let offline = 0;

    for (const node of nodes) {
      const latest = await hbRepo().findOne({ where: { nodeId: node.id }, order: { id: 'DESC' } });
      if (!latest) {
        offline++;
        continue;
      }
      const ageMs = now.getTime() - new Date(latest.timestamp).getTime();
      if (ageMs <= 2 * 60 * 1000 && latest.status === 'ok') {
        online++;
      } else if (ageMs <= 10 * 60 * 1000) {
        degraded++;
      } else {
        offline++;
      }
    }

    let status: 'online' | 'degraded' | 'offline' = 'offline';
    if (total === 0) status = 'offline';
    else if (online === total) status = 'online';
    else if (online > 0) status = 'degraded';

    return {
      nodeCount: total,
      online,
      degraded,
      offline,
      status,
      timestamp: now.toISOString(),
    };
  });
}

export default publicRoutes;
