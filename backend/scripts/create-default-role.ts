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
    // Server
    'servers:create', 'servers:read', 'servers:write', 'servers:delete', 'servers:power', 'servers:kvm', 'servers:console',
    // Files
    'files:read', 'files:write',
    // Backups
    'backups:read', 'backups:create', 'backups:write',
    // Commands, logs, reinstall
    'commands:execute', 'logs:read', 'reinstall:execute',
    // Schedules, sync, transfers, version
    'schedules:read', 'schedules:create', 'schedules:write', 'sync:execute', 'transfer:execute', 'version:read',
    // Configuration
    'configuration:read', 'configuration:write',
    // API keys
    'apikeys:read', 'apikeys:create', 'apikeys:delete',
    // Organisations / SOC / Orders / AI
    'org:create', 'org:invite', 'soc:write', 'orders:create', 'ai:create',
    // Nodes / infra
    'nodes:update-creds', 'nodes:read-creds', 'nodes:map', 'infra:dns',
  ];

  for (const pval of basicPerms) {
    let p = await permRepo.findOne({ where: { value: pval, role: { id: def.id } }, relations: ['role'] });
    if (!p) {
      p = permRepo.create({ value: pval, role: def });
      await permRepo.save(p);
      console.log(`Added permission ${pval} to default role`);
    } else {
      // skip
    }
  }

  console.log('Default role setup complete');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });