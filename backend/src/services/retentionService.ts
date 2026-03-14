import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { UserLog } from '../models/userLog.entity';
import { SocData } from '../models/socData.entity';

export async function cleanupOrders() {
  const orderRepo = AppDataSource.getRepository(Order);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 10);
  await orderRepo.createQueryBuilder().delete().where('expiresAt < :cutoff', { cutoff }).execute();
}

export async function cleanupLogs() {
  const logRepo = AppDataSource.getRepository(UserLog);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  await logRepo.createQueryBuilder().delete().where('timestamp < :cutoff', { cutoff }).execute();

  const apiRepo = AppDataSource.getRepository(require('../models/apiRequestLog.entity').ApiRequestLog);
  await apiRepo.createQueryBuilder().delete().where('timestamp < :cutoff', { cutoff }).execute();

  const usageRepo = AppDataSource.getRepository(require('../models/aiUsage.entity').AIUsage);
  await usageRepo.createQueryBuilder().delete().where('timestamp < :cutoff', { cutoff }).execute();

  const socRepo = AppDataSource.getRepository(SocData);
  const socCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await socRepo.createQueryBuilder().delete().where('timestamp < :cutoff', { cutoff: socCutoff }).execute();
}

export function startRetentionJobs() {
  setInterval(async () => {
    try {
      await cleanupOrders();
      await cleanupLogs();
    } catch (e) {
      console.error('Retention cleanup error', e);
    }
  }, 24 * 60 * 60 * 1000);
}
