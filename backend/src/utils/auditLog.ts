import { AppDataSource } from '../config/typeorm';
import { UserLog } from '../models/userLog.entity';

export async function auditLog(opts: {
  userId?: number;
  action: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(UserLog);
    await repo.save(
      repo.create({
        userId: opts.userId ?? 0,
        action: opts.action,
        targetId: opts.targetId ?? null,
        targetType: opts.targetType ?? null,
        ipAddress: opts.ipAddress ?? '127.0.0.1',
        timestamp: new Date(),
        metadata: opts.metadata ?? undefined,
      })
    );
  } catch {
    // buh auditor broke
  }
}
