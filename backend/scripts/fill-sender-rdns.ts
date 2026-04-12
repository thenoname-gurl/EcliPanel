import { AppDataSource } from '../src/config/typeorm';
import { MailMessage } from '../src/models/mailMessage.entity';
import { resolveReverseDns } from '../src/utils/mailboxMessage';

async function run() {
  await AppDataSource.initialize();
  const messageRepo = AppDataSource.getRepository(MailMessage);

  const messages = await messageRepo.createQueryBuilder('message')
    .where('message.senderRdns IS NULL')
    .andWhere('message.senderIp IS NOT NULL')
    .getMany();

  if (messages.length === 0) {
    console.log('No mailbox messages require senderRdns backfill.');
    process.exit(0);
  }

  console.log(`Found ${messages.length} messages with senderIp but no senderRdns.`);

  let updatedCount = 0;
  for (const message of messages) {
    if (!message.senderIp) continue;
    const rdns = await resolveReverseDns(message.senderIp);
    if (rdns) {
      message.senderRdns = rdns;
      await messageRepo.save(message);
      updatedCount += 1;
      console.log(`Updated message ${message.id} -> ${rdns}`);
    }
  }

  console.log(`Backfill complete. Updated ${updatedCount} message(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error('Failed to backfill senderRdns:', error);
  process.exit(1);
});