import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { UserLog } from '../models/userLog.entity';
import cron from 'node-cron';

export async function runStudentReverifyJob() {
  const jobId = Date.now();
  console.log(`[StudentReverify:${jobId}] Running reverify job...`);
  try {
    const userRepo = AppDataSource.getRepository(User);
    const logRepo = AppDataSource.getRepository(UserLog);

    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const candidates = await userRepo
      .createQueryBuilder('u')
      .where('u.studentVerified = :sv', { sv: true })
      .andWhere('u.studentVerifiedAt IS NOT NULL')
      .andWhere('u.studentVerifiedAt < :cutoff', { cutoff: cutoff.toISOString() })
      .getMany();

    if (!candidates || candidates.length === 0) return;

    for (const u of candidates) {
      try {
        u.studentVerified = false;
        u.studentVerifiedAt = null as any;
        u.educationLimits = null as any;
        await userRepo.save(u);
        await logRepo.save(
          logRepo.create({
            userId: 0,
            action: 'scheduled-require-student-reverify',
            targetId: String(u.id),
            targetType: 'user',
            timestamp: new Date(),
            metadata: { reason: 'annual' },
          } as any)
        );
      } catch (e) {
        // skip
      }
    }
  } catch (e) {
    console.log(`[StudentReverify:${jobId}] Error running reverify job:`, e);
  }
  console.log(`[StudentReverify:${jobId}] Finished reverify job...`);
}

export async function scheduleStudentReverifyJob() {
  console.log('Starting student reverify job...');

  await runStudentReverifyJob().catch((e) => {console.log('Error running student reverify job', e)});
  try {
    cron.schedule('0 0 * * *', async () => {
      await runStudentReverifyJob().catch((e) => {console.log('Error running student reverify job', e)});
    });
  } catch (e) {
    console.error('Failed to schedule student reverify job via cron', e);
  }
}

export default runStudentReverifyJob;