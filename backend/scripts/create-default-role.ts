import { AppDataSource } from '../src/config/typeorm';
import { Role } from '../src/models/role.entity';
import { Permission } from '../src/models/permission.entity';

async function run() {
  await AppDataSource.initialize();
  const roleRepo = AppDataSource.getRepository(Role);
  const permRepo = AppDataSource.getRepository(Permission);

  let def = await roleRepo.findOneBy({ name: 'default' });
  if (!def) {
    def = roleRepo.create({ name: 'default', description: 'Default role is applied to users with no assigned role' });
    await roleRepo.save(def);
    console.log('Created role: default');
  } else {
    console.log('Role default already exists');
  }

  const basicPerms = [
    'servers:create',
  ];

  for (const pval of basicPerms) {
    let p = await permRepo.findOne({ where: { value: pval, role: { id: def.id } }, relations: { role: true } });
    if (!p) {
      p = permRepo.create({ value: pval, role: def });
      await permRepo.save(p);
      console.log(`Added permission ${pval} to default role`);
    }
  }

  const allPerms = await permRepo.find({ where: { role: { id: def.id } }, relations: { role: true } });
  for (const p of allPerms) {
    if (!basicPerms.includes(p.value)) {
      await permRepo.remove(p);
      console.log(`Removed stale permission ${p.value} from default role`);
    }
  }

  console.log('Default role setup complete');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });