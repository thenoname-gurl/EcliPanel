import { AppDataSource } from '../src/config/typeorm';
import { Role } from '../src/models/role.entity';
import { Permission } from '../src/models/permission.entity';

async function run() {
  await AppDataSource.initialize();
  const roleRepo = AppDataSource.getRepository(Role);
  const permRepo = AppDataSource.getRepository(Permission);

  let root = await roleRepo.findOneBy({ name: 'rootAdmin' });
  if (!root) {
    root = roleRepo.create({ name: 'rootAdmin', description: 'Full access role' });
    await roleRepo.save(root);
  }
  let perm = await permRepo.findOneBy({ value: '*' });
  if (!perm) {
    perm = permRepo.create({ value: '*', role: root });
    await permRepo.save(perm);
  }

  const akPerms = ['apikeys:create','apikeys:read','apikeys:delete'];
  let consolePerm = await permRepo.findOneBy({ value: 'servers:console' });
  if (!consolePerm) {
    consolePerm = permRepo.create({ value: 'servers:console', role: root });
    await permRepo.save(consolePerm);
  }
  for (const pval of akPerms) {
    let p = await permRepo.findOneBy({ value: pval });
    if (!p) {
      p = permRepo.create({ value: pval, role: root });
      await permRepo.save(p);
    }
  }

  console.log('Seed complete');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });