import 'reflect-metadata';
import { AppDataSource } from '../src/config/typeorm';
import { User } from '../src/models/user.entity';

async function run() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(User);
  const users = await repo.find();
  console.log(`Found ${users.length} users`);
  const { encrypt } = require('../src/utils/crypto');
  let updated = 0;

  for (const u of users) {
    let changed = false;
    const isEnc = (v: any) => typeof v === 'string' && v.split(':').length === 3;
    if (u.address && !isEnc(u.address)) {
      u.address = encrypt(u.address);
      changed = true;
    }
    if ((u as any).address2 && !isEnc((u as any).address2)) {
      (u as any).address2 = encrypt((u as any).address2);
      changed = true;
    }
    if ((u as any).phone && !isEnc((u as any).phone)) {
      (u as any).phone = encrypt((u as any).phone);
      changed = true;
    }
    if (changed) {
      await repo.save(u);
      updated++;
      console.log(`Updated user ${u.id}`);
    }
  }

  console.log(`Encryption complete. Updated ${updated} users.`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });