import { schedule } from '../utils/cron';
import { AppDataSource } from '../config/typeorm';
import { CalendarEvent } from '../models/calendarEvent.entity';
import { EventReminder } from '../models/eventReminder.entity';
import { User } from '../models/user.entity';
import { createNotification } from '../utils/notificationHelper';
import { sendMail } from '../services/mailService';

const CHECK_INTERVAL = '* * * * *';

export function scheduleCalendarNotificationJob() {
  console.log('[calendarNotificationJob] scheduled (* * * * *)');
  schedule(CHECK_INTERVAL, async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const events = await AppDataSource.getRepository(CalendarEvent).find({
        where: { date: todayStr },
      });

      if (events.length === 0) return;

      const reminderRepo = AppDataSource.getRepository(EventReminder);
      const userRepo = AppDataSource.getRepository(User);

      for (const ev of events) {
        const reminders = await reminderRepo.find({ where: { eventId: ev.id } });
        if (reminders.length === 0) continue;

        const [eh, em] = ev.startTime.split(':').map(Number);
        const eventTotalMinutes = eh * 60 + em;
        const nowTotalMinutes = currentHour * 60 + currentMinute;

        for (const reminder of reminders) {
          const diff = eventTotalMinutes - nowTotalMinutes;
          if (diff > reminder.remindMinutesBefore || diff < 0) continue;

          if (wasNotified(ev.id, ev.date, ev.startTime, reminder.userId)) continue;

          const title = `Upcoming: ${ev.title}`;
          const body = `${ev.title} starts at ${ev.startTime}${ev.description ? ` — ${ev.description}` : ''}`;

          try {
            await createNotification({
              userId: reminder.userId,
              type: 'calendar',
              title,
              body,
              url: `/dashboard/calendar?event=${ev.id}`,
            });
          } catch { /* peanuts and pancakes */ }

          try {
            const user = await userRepo.findOneBy({ id: reminder.userId });
            if (user?.email) {
              await sendMail({
                to: user.email,
                from: process.env.SMTP_FROM || 'noreply@ecli.app',
                subject: title,
                template: 'notification',
                vars: {
                  title,
                  message: body,
                  details: `Event: ${ev.title}\nDate: ${ev.date}\nTime: ${ev.startTime}–${ev.endTime}${ev.description ? `\nDescription: ${ev.description}` : ''}`,
                },
              });
            }
          } catch { /* OWO */ }

          markNotified(ev.id, ev.date, ev.startTime, reminder.userId);
        }
      }
    } catch (e) {
      console.error('[calendarNotificationJob] run failed:', e);
    }
  });
}

const notifiedSet = new Set<string>();

function notifiedKey(eventId: number, date: string, startTime: string, userId: number): string {
  return `${eventId}|${date}|${startTime}|${userId}`;
}

function wasNotified(eventId: number, date: string, startTime: string, userId: number): boolean {
  return notifiedSet.has(notifiedKey(eventId, date, startTime, userId));
}

function markNotified(eventId: number, date: string, startTime: string, userId: number): void {
  notifiedSet.add(notifiedKey(eventId, date, startTime, userId));
  if (notifiedSet.size > 10000) notifiedSet.clear();
}