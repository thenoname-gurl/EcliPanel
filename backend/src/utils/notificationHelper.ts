import { AppDataSource } from '../config/typeorm';
import { Notification } from '../models/notification.entity';

export async function createNotification(data: {
  userId: number;
  type?: string;
  title: string;
  body: string;
  url?: string;
}) {
  const repo = AppDataSource.getRepository(Notification);
  const notif = repo.create({
    userId: data.userId,
    type: data.type || 'system',
    title: data.title,
    body: data.body,
    url: data.url || null,
  });
  return repo.save(notif);
}