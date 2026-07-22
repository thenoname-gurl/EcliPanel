import { AppDataSource } from '../config/typeorm';
import { EloProject } from '../models/eloProject.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { User } from '../models/user.entity';
import { nodeService } from '../services/nodeService';
import { WingsApiService } from '../services/wingsApiService';
import { calculateEloResources } from '../services/eloService';
import { schedule } from '../utils/cron';

const DECAY_GRACE_DAYS = 30;
const DECAY_RATE_PER_DAY = 0.05;
const MIN_ELO = 100;
const MAX_DAYS_PAST_GRACE = 200;

async function processEloDecay() {
  const repo = AppDataSource.getRepository(EloProject);
  const cfgRepo = AppDataSource.getRepository(ServerConfig);
  const userRepo = AppDataSource.getRepository(User);

  const cutoff = new Date(Date.now() - DECAY_GRACE_DAYS * 86400000);
  const oldProjects = await repo
    .createQueryBuilder('p')
    .where('p.lastActiveAt IS NOT NULL AND p.lastActiveAt < :cutoff', { cutoff })
    .getMany();

  if (oldProjects.length === 0) return;

  let decayed = 0;
  for (const project of oldProjects) {
    if (!project.lastActiveAt) continue;

    const daysPastGrace = Math.floor((Date.now() - project.lastActiveAt.getTime()) / 86400000) - DECAY_GRACE_DAYS;
    const cappedDays = Math.min(daysPastGrace, MAX_DAYS_PAST_GRACE);
    if (cappedDays <= 0) continue;

    const decayFactor = Math.pow(1 - DECAY_RATE_PER_DAY, cappedDays);
    const newElo = Math.max(MIN_ELO, Math.round(project.eloScore * decayFactor));

    if (newElo >= project.eloScore) continue;

    project.eloScore = newElo;
    project.kFactor = 24;
    await repo.save(project);

    const cfg = await cfgRepo.findOneBy({ uuid: project.serverId });
    if (!cfg) continue;

    const owner = await userRepo.findOneBy({ id: project.userId });
    const isHackClub = owner?.studentVerified || false;
    const resources = calculateEloResources(newElo, isHackClub, project.isWellMade);

    cfg.memory = resources.memory;
    cfg.disk = resources.disk;
    cfg.cpu = resources.cpu;
    await cfgRepo.save(cfg);

    try {
      const svc = await nodeService.getServiceForServer(project.serverId);
      if (svc instanceof WingsApiService) {
        await svc.syncServer(project.serverId, {
          build: {
            memory_limit: resources.memory,
            disk_space: resources.disk,
            cpu_limit: resources.cpu,
          },
        });
      }
    } catch {
      // beh
    }

    decayed++;
  }

  if (decayed > 0) {
    console.log(`[eloDecayJob] Applied ELO decay to ${decayed} inactive project(s)`);
  }
}

export function scheduleEloDecayJob() {
  processEloDecay().catch((e: any) =>
    console.error('[eloDecayJob] initial run failed', e)
  );

  schedule('0 4 * * *', async () => {
    await processEloDecay().catch((e: any) =>
      console.error('[eloDecayJob] run failed', e)
    );
  });
}
