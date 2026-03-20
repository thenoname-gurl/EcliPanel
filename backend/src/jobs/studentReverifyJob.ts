import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import { UserLog } from '../models/userLog.entity';

export async function runStudentReverifyJob() {
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
    console.error('studentReverifyJob error', e);
  }
}

export function scheduleStudentReverifyJob() {
  runStudentReverifyJob().catch(() => {});
  try {
    setInterval(() => {
      runStudentReverifyJob().catch(() => {});
    }, 24 * 60 * 60 * 1000);
  } catch (e) {
    // skip
  }
}

export default runStudentReverifyJob;