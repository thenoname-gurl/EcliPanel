import { schedule } from '../utils/cron';
import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { UserStorage } from '../models/userStorage.entity';
import { OfficeDocument } from '../models/officeDocument.entity';
import { provisionStorageServer } from '../services/cloudStorageService';

const BACKFILL_INTERVAL = '0 4 * * *';

export function scheduleStorageBackfillJob() {
  schedule(BACKFILL_INTERVAL, async () => {
    try {
      const userStorageRepo = AppDataSource.getRepository(UserStorage);
      const existing = new Set(
        (await userStorageRepo.find({ select: { userId: true } })).map(r => r.userId)
      );

      const officeUsers = await AppDataSource.getRepository(OfficeDocument)
        .createQueryBuilder('d')
        .select('DISTINCT d.userId', 'userId')
        .getRawMany();

      const userIds = officeUsers
        .map((row: any) => Number(row.userId))
        .filter((id: number) => Number.isFinite(id) && id > 0 && !existing.has(id));

      if (userIds.length === 0) return;

      for (const userId of userIds) {
        try {
          await provisionStorageServer(userId);
          console.log(`[storageBackfillJob] provisioned storage for user ${userId}`);
        } catch (e: any) {
          console.warn(`[storageBackfillJob] failed for user ${userId}:`, e?.message || e);
        }
      }
    } catch (e) {
      console.error('[storageBackfillJob] run failed', e);
    }
  });
}