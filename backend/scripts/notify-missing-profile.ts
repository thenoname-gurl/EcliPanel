import 'reflect-metadata';
import { AppDataSource } from '../src/config/typeorm';
import { User } from '../src/models/user.entity';
import { connectRedis, redisSet } from '../src/config/redis';
import { sendMail } from '../src/services/mailService';
import { v4 as uuidv4 } from 'uuid';

const PANEL_URL = (process.env.PANEL_URL || 'https://ecli.app').replace(/\/+$/, '');
const requiredFields = [
  'firstName',
  'lastName',
  'displayName',
  'address',
  'phone',
  'dateOfBirth',
  'billingCity',
  'billingState',
  'billingZip',
  'billingCountry',
] as const;

type UserField = typeof requiredFields[number];

function isMissing(value: any) {
  return value == null || String(value).trim() === '';
}

function getMissingFields(user: User) {
  const missing: string[] = [];
  for (const field of requiredFields) {
    if (isMissing((user as any)[field])) {
      missing.push(field);
    }
  }
  return missing;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit = 0;
  let testEmail = '';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '-d' || arg === '--preview' || arg === '-p') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      limit = Number(arg.split('=')[1]) || limit;
      continue;
    }
    if (arg === '--limit' && args[i + 1]) {
      limit = Number(args[i + 1]) || limit;
      i += 1;
      continue;
    }
    if (arg.startsWith('--test=')) {
      testEmail = arg.split('=')[1] || '';
      continue;
    }
    if (arg === '--test' && args[i + 1]) {
      testEmail = args[i + 1];
      i += 1;
      continue;
    }
  }

  return { dryRun, limit, testEmail };
}

async function run() {
  const { dryRun, limit, testEmail } = parseArgs();
  const envMode = process.env.NODE_ENV || 'development';
  console.log(`notify-missing-profile: mode=${envMode} dryRun=${dryRun} limit=${limit || 'none'} testEmail=${testEmail || 'none'}`);

  await AppDataSource.initialize();
  await connectRedis();
  const repo = AppDataSource.getRepository(User);
  const notificationMessage = `We recently moved to a new encryption system and found that your account has missing profile fields.<br>Please update your information and reset your password to keep your account protected and save from Anti Fraud suspension!<br><br>What happened?<br>> We wanted to improve our hosting security and we changed all encryption algorithms which resulted in previous Personal Identification Information being lost, all passwords are still intack and are working but we still advice to change it as we update to more stronger hashing system (bcrypt -> Argon2ID)!<br><br>What to do?<br>> Go to your account settings and update your password and Personal Identification Information!<br><br>Missing information from our record is following: `;

  if (testEmail) {
    const user = await repo.findOneBy({ email: testEmail });
    const missingFields = user ? getMissingFields(user) : ['firstName', 'lastName', 'address'];
    const token = uuidv4();
    const ttl = 72 * 3600;
    if (user) {
      await redisSet(`password-reset:${token}`, String(user.id), ttl);
    }
    const resetUrl = `${PANEL_URL}/reset-password/${token}`;
    const displayName = user?.displayName || user?.firstName || testEmail.split('@')[0];

    await sendMail({
      to: testEmail,
      from: process.env.SMTP_USER || process.env.MAIL_FROM || 'noreply@ecli.app',
      subject: 'Update your profile and reset your password!',
      template: 'password-reset',
      vars: {
        name: displayName,
        url: resetUrl,
        message: `${notificationMessage}${missingFields.join(', ')}.`,
      },
    });

    console.log(`Test email sent to ${testEmail} (${user ? 'real user' : 'preview only'})`);
    process.exit(0);
  }

  const users = await repo.find();
  console.log(`Loaded ${users.length} users from database`);

  const candidates = users
    .filter((user) => user.email && String(user.email).trim())
    .map((user) => ({ user, missingFields: getMissingFields(user) }))
    .filter(({ missingFields }) => missingFields.length > 0);

  console.log(`Found ${candidates.length} users with at least one missing profile field`);
  if (candidates.length === 0) {
    process.exit(0);
  }

  if (dryRun) {
    console.log('Dry run mode enabled. The following users would be notified:');
    for (const { user, missingFields } of candidates.slice(0, limit || undefined)) {
      console.log(`  id=${user.id} email=${user.email} missing=${missingFields.join(', ')}`);
    }
    process.exit(0);
  }

  const ttl = 72 * 3600;
  let sent = 0;
  for (const { user, missingFields } of candidates) {
    if (limit && sent >= limit) break;

    const token = uuidv4();
    await redisSet(`password-reset:${token}`, String(user.id), ttl);
    const resetUrl = `${PANEL_URL}/reset-password/${token}`;
    const displayName = user.displayName || user.firstName || user.email.split('@')[0];
    const message = notificationMessage;

    try {
      await sendMail({
        to: user.email,
        from: process.env.SMTP_USER || process.env.MAIL_FROM || 'noreply@ecli.app',
        subject: 'Update your profile and reset your password!',
        template: 'password-reset',
        vars: {
          name: displayName,
          url: resetUrl,
          message: `${message}${missingFields.join(', ')}.`,
        },
      });
      sent += 1;
      console.log(`Sent notification to id=${user.id} email=${user.email} missing=${missingFields.join(', ')}`);
    } catch (e) {
      console.error(`Failed to send email to id=${user.id} email=${user.email}`, e);
    }
  }

  console.log(`Notification complete. Sent ${sent} emails.`);
  process.exit(0);
}

run().catch((error) => {
  console.error('notify-missing-profile failed', error);
  process.exit(1);
});