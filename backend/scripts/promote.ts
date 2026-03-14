/**
 * Promote a user to rootAdmin (or any other role.
 *
 * Usage:
 *   npm run promote -- <email> [role]
 *
 * Examples:
 *   npm run promote -- admin@example.com
 *   npm run promote -- admin@example.com rootAdmin
 *   npm run promote -- admin@example.com admin
 *
 * Default role: rootAdmin
 */
/// <reference types="node" />

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { AppDataSource } from '../src/config/typeorm';
import { User } from '../src/models/user.entity';

async function run() {
  const email = process.argv[2];
  const role  = process.argv[3] || 'rootAdmin';

  if (!email) {
    console.error('Usage: npm run promote -- <email> [role]');
    process.exit(1);
  }

  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneBy({ email });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const target = user as User;
  const prev = target.role ?? '(none)';
  target.role = role;
  await userRepo.save(target);

  console.log(`✓ ${target.firstName} ${target.lastName} <${target.email}>`);
  console.log(`  role: ${prev} → ${role}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});