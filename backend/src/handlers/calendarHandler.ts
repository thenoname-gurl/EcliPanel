import { AppDataSource } from '../config/typeorm';
import { CalendarEvent } from '../models/calendarEvent.entity';
import { CalendarBooking } from '../models/calendarBooking.entity';
import { AvailabilitySchedule } from '../models/availabilitySchedule.entity';
import { TodoItem } from '../models/todoItem.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { sendMail } from '../services/mailService';
import { getRolloutTreatment } from '../services/rolloutService';
import { createActivityLog } from './logHandler';

const CALENDAR_ROLLOUT_KEY = 'calendar';

async function calendarRollout(ctx: any) {
  const { inRollout } = await getRolloutTreatment(ctx.user.id, CALENDAR_ROLLOUT_KEY);
  if (!inRollout) {
    ctx.set.status = 403;
    return 'Calendar feature is not available';
  }
}

function generateSlug(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
}

// Simple in-memory cache for holiday data (module-scoped, persists across requests)
const holidayCache = new Map<string, { data: any[]; ts: number }>();
const HOLIDAY_CACHE_TTL = 86_400_000; // 24h
const HOLIDAY_COUNTRY_RE = /^[A-Za-z]{2}$/;
const HOLIDAY_YEAR_RE = /^\d{4}$/;

export async function calendarRoutes(app: any, prefix = '') {
  const eventRepo = () => AppDataSource.getRepository(CalendarEvent);
  const todoRepo = () => AppDataSource.getRepository(TodoItem);
  const scheduleRepo = () => AppDataSource.getRepository(AvailabilitySchedule);

  app.get(
    prefix + '/calendar/events',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const month = ctx.query?.month as string | undefined;
      const qb = eventRepo().createQueryBuilder('e').where('e.userId = :userId', { userId });
      if (month) {
        qb.andWhere("e.date LIKE :month", { month: `${month}%` });
      }
      const events = await qb.orderBy('e.date', 'ASC').addOrderBy('e.startTime', 'ASC').getMany();
      return events;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'List calendar events' },
    }
  );

  app.get(
    prefix + '/calendar/events/:id',
    async (ctx: any) => {
      const id = Number(ctx.params?.id);
      const isPublic = ctx.query?.public === '1';
      const ev = isPublic
        ? await eventRepo().findOneBy({ id })
        : await eventRepo().findOneBy({ id, userId: ctx.user?.id });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
      if (isPublic) {
        let bookingCount = 0;
        try {
          bookingCount = await AppDataSource.getRepository(CalendarBooking).countBy({ eventId: id });
        } catch { /* existence is delulu */ }
        return { id: ev.id, title: ev.title, description: ev.description, date: ev.date, startTime: ev.startTime, endTime: ev.endTime, color: ev.color, recurring: ev.recurring, recurringEnd: ev.recurringEnd, isAppointment: ev.isAppointment, appointmentEmail: ev.appointmentEmail, appointmentName: ev.appointmentName, bookingFields: ev.bookingFields, bookingData: ev.bookingData, bookingType: ev.bookingType || 'call', maxCapacity: ev.maxCapacity ?? 1, availableDays: ev.availableDays, availableStartTime: ev.availableStartTime, availableEndTime: ev.availableEndTime, slotDuration: ev.slotDuration, bufferMinutes: ev.bufferMinutes ?? 0, bookingStartDate: ev.bookingStartDate, bookingEndDate: ev.bookingEndDate, bookingCount };
      }
      return ev;
    },
    {
      detail: { tags: ['Calendar'], summary: 'Get calendar event' },
    }
  );

  app.get(
    prefix + '/calendar/events/:id/available-slots',
    async (ctx: any) => {
      const id = Number(ctx.params?.id);
      const ev = await eventRepo().findOneBy({ id });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
      if (ev.bookingType !== 'availability') { ctx.set.status = 400; return { error: 'Not an availability-type event' }; }

      const slotDuration = ev.slotDuration || 60;
      const bufferMinutes = ev.bufferMinutes || 0;
      const startTime = ev.availableStartTime || '09:00';
      const endTime = ev.availableEndTime || '17:00';
      const days = ev.availableDays && ev.availableDays.length > 0 ? ev.availableDays : [1,2,3,4,5];
      const startDate = ev.bookingStartDate || ev.date;
      const endDate = ev.bookingEndDate || (() => {
        const d = new Date(startDate); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10);
      })();

      const bookingRepo = AppDataSource.getRepository(CalendarBooking);
      const allBookings = await bookingRepo.find({ where: { eventId: id } });

      function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
      function pad2(n: number) { return String(n).padStart(2, '0'); }

      const slots: { date: string; time: string; endTime: string; available: boolean }[] = [];
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (!days.includes(d.getDay())) continue;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayMins = toMins(startTime);
        const dayEndMins = toMins(endTime);
        let slotStart = dayMins;
        while (slotStart + slotDuration <= dayEndMins) {
          const slotEnd = slotStart + slotDuration;
          const slotTime = `${pad2(Math.floor(slotStart / 60))}:${pad2(slotStart % 60)}`;
          const slotEndStr = `${pad2(Math.floor(slotEnd / 60))}:${pad2(slotEnd % 60)}`;
          const isPast = dateStr < todayLocal || (dateStr === todayLocal && slotStart <= now.getHours() * 60 + now.getMinutes());
          const bookedCount = allBookings.filter((b: any) => {
            const bd = b.data || {};
            return bd.slotDate === dateStr && bd.slotTime === slotTime;
          }).length;
          const available = !isPast && (ev.maxCapacity <= 0 || bookedCount < ev.maxCapacity);
          slots.push({ date: dateStr, time: slotTime, endTime: slotEndStr, available });
          slotStart += slotDuration + bufferMinutes;
        }
      }

      const grouped: Record<string, { time: string; endTime: string; available: boolean }[]> = {};
      for (const s of slots) {
        if (!grouped[s.date]) grouped[s.date] = [];
        grouped[s.date].push({ time: s.time, endTime: s.endTime, available: s.available });
      }

      return { slots: grouped, timezone: 'UTC' };
    },
    {
      detail: { tags: ['Calendar'], summary: 'Get available time slots for an availability-type event' },
    }
  );

  app.post(
    prefix + '/calendar/events',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const body = ctx.body as any;
      const ev = eventRepo().create({
        userId,
        title: String(body.title || '').trim(),
        description: String(body.description || '').trim(),
        date: String(body.date || ''),
        startTime: String(body.startTime || '09:00'),
        endTime: String(body.endTime || '10:00'),
        color: String(body.color || '#8b5cf6'),
        recurring: String(body.recurring || 'none'),
        recurringEnd: body.recurringEnd ? String(body.recurringEnd) : undefined,
        isAppointment: body.isAppointment === true || body.bookingType === 'rsvp',
        appointmentEmail: body.appointmentEmail ? String(body.appointmentEmail) : undefined,
        appointmentName: body.appointmentName ? String(body.appointmentName) : undefined,
        bookingFields: Array.isArray(body.bookingFields) ? body.bookingFields : undefined,
        bookingData: body.bookingData ? body.bookingData : undefined,
        bookingType: String(body.bookingType || 'call'),
        maxCapacity: Number(body.maxCapacity) || 1,
        availableDays: Array.isArray(body.availableDays) ? body.availableDays : undefined,
        availableStartTime: body.availableStartTime ? String(body.availableStartTime) : undefined,
        availableEndTime: body.availableEndTime ? String(body.availableEndTime) : undefined,
        slotDuration: body.slotDuration ? Number(body.slotDuration) : undefined,
        bufferMinutes: Number(body.bufferMinutes) || 0,
        bookingStartDate: body.bookingStartDate ? String(body.bookingStartDate) : undefined,
        bookingEndDate: body.bookingEndDate ? String(body.bookingEndDate) : undefined,
      });
      if (!ev.title) { ctx.set.status = 400; return { error: 'Title is required' }; }
      if (!ev.date) { ctx.set.status = 400; return { error: 'Date is required' }; }
      const saved = await eventRepo().save(ev);
      ctx.set.status = 201;
      createActivityLog({ userId, action: 'calendar:event:create', targetId: String(saved.id), targetType: 'calendar-event', metadata: { title: saved.title, date: saved.date }, ipAddress: ctx.ip }).catch(() => {});
      return saved;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Create calendar event' },
    }
  );

  app.put(
    prefix + '/calendar/events/:id',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const id = Number(ctx.params?.id);
      const body = ctx.body as any;
      const ev = await eventRepo().findOneBy({ id, userId });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
      if (body.title !== undefined) ev.title = String(body.title).trim();
      if (body.description !== undefined) ev.description = String(body.description).trim();
      if (body.date !== undefined) ev.date = String(body.date);
      if (body.startTime !== undefined) ev.startTime = String(body.startTime);
      if (body.endTime !== undefined) ev.endTime = String(body.endTime);
      if (body.color !== undefined) ev.color = String(body.color);
      if (body.recurring !== undefined) ev.recurring = String(body.recurring);
      if (body.recurringEnd !== undefined) ev.recurringEnd = String(body.recurringEnd);
      if (body.isAppointment !== undefined) ev.isAppointment = Boolean(body.isAppointment);
      if (body.appointmentEmail !== undefined) ev.appointmentEmail = body.appointmentEmail ? String(body.appointmentEmail) : null;
      if (body.appointmentName !== undefined) ev.appointmentName = body.appointmentName ? String(body.appointmentName) : null;
      if (body.bookingFields !== undefined) ev.bookingFields = Array.isArray(body.bookingFields) ? body.bookingFields : null;
      if (body.bookingData !== undefined) ev.bookingData = body.bookingData ? body.bookingData : null;
      if (body.bookingType !== undefined) ev.bookingType = String(body.bookingType);
      if (body.maxCapacity !== undefined) ev.maxCapacity = Number(body.maxCapacity);
      if (body.availableDays !== undefined) ev.availableDays = Array.isArray(body.availableDays) ? body.availableDays : null;
      if (body.availableStartTime !== undefined) ev.availableStartTime = body.availableStartTime ? String(body.availableStartTime) : null;
      if (body.availableEndTime !== undefined) ev.availableEndTime = body.availableEndTime ? String(body.availableEndTime) : null;
      if (body.slotDuration !== undefined) ev.slotDuration = body.slotDuration ? Number(body.slotDuration) : null;
      if (body.bufferMinutes !== undefined) ev.bufferMinutes = Number(body.bufferMinutes) || 0;
      if (body.bookingStartDate !== undefined) ev.bookingStartDate = body.bookingStartDate ? String(body.bookingStartDate) : null;
      if (body.bookingEndDate !== undefined) ev.bookingEndDate = body.bookingEndDate ? String(body.bookingEndDate) : null;
      const saved = await eventRepo().save(ev);
      createActivityLog({ userId, action: 'calendar:event:update', targetId: String(id), targetType: 'calendar-event', metadata: { title: saved.title }, ipAddress: ctx.ip }).catch(() => {});
      return saved;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Update calendar event' },
    }
  );

  app.post(
    prefix + '/calendar/events/:id/book',
    async (ctx: any) => {
      const id = Number(ctx.params?.id);
      const body = ctx.body as any;
      const ev = await eventRepo().findOneBy({ id });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
      if (!ev.isAppointment) { ctx.set.status = 400; return { error: 'This event is not bookable' }; }

      const bookingRepo = () => AppDataSource.getRepository(CalendarBooking);

      const emailVal = String(body.email || body['email'] || '').trim();
      if (!emailVal || !emailVal.includes('@')) {
        ctx.set.status = 400;
        return { error: 'A valid email is required to book' };
      }

      let slotDate = ev.date;
      let slotTime = ev.startTime || '09:00';
      let slotEnd = ev.endTime || '10:00';
      if (ev.bookingType === 'availability') {
        slotDate = String(body.slotDate || '').trim();
        slotTime = String(body.slotTime || '').trim();
        if (!slotDate || !slotTime) {
          ctx.set.status = 400;
          return { error: 'Please select a date and time slot' };
        }
        const availStartTime = ev.availableStartTime || '09:00';
        const availEndTime = ev.availableEndTime || '17:00';
        const duration = ev.slotDuration || 60;
        const buffer = ev.bufferMinutes || 0;
        function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
        function pad2(n: number) { return String(n).padStart(2, '0'); }
        const dayMins = toMins(availStartTime);
        const dayEndMins = toMins(availEndTime);
        let valid = false;
        let s = dayMins;
        while (s + duration <= dayEndMins) {
          const t = `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
          if (t === slotTime) { slotEnd = `${pad2(Math.floor((s + duration) / 60))}:${pad2((s + duration) % 60)}`; valid = true; break; }
          s += duration + buffer;
        }
        if (!valid) {
          ctx.set.status = 400;
          return { error: 'Invalid time slot selected' };
        }
        const existingSlots = await bookingRepo().find({ where: { eventId: id } });
        const bookedOnSlot = existingSlots.filter((b: any) => {
          const bd = b.data || {};
          return bd.slotDate === slotDate && bd.slotTime === slotTime;
        }).length;
        if (ev.maxCapacity > 0 && bookedOnSlot >= ev.maxCapacity) {
          ctx.set.status = 400;
          return { error: 'This time slot is already fully booked' };
        }
        const sameEmail = existingSlots.find((b: any) => b.email === emailVal);
        if (sameEmail) {
          ctx.set.status = 400;
          return { error: 'You already have a booking for this event' };
        }
      } else {
        const existingBooking = await bookingRepo().findOneBy({ eventId: id, email: emailVal });
        if (existingBooking) {
          if (ev.bookingType === 'rsvp') {
            ctx.set.status = 400;
            return { error: 'You have already RSVP\'d for this event' };
          }
          const now = new Date();
          const eventEnd = new Date(`${ev.date}T${ev.endTime || '23:59'}`);
          if (eventEnd > now) {
            ctx.set.status = 400;
            return { error: 'You already have a booking for this time slot. Please wait until the current session ends before rebooking.' };
          }
        }

        if (ev.maxCapacity > 0) {
          const existingCount = await bookingRepo().countBy({ eventId: id });
          if (existingCount >= ev.maxCapacity) {
            ctx.set.status = 400;
            return { error: 'This event is fully booked' };
          }
        }
      }

      const fields = ev.bookingFields && ev.bookingFields.length > 0 ? ev.bookingFields : [
        { key: 'name', label: 'Name', required: true, type: 'text' },
        { key: 'email', label: 'Email', required: true, type: 'email' },
        { key: 'message', label: 'Message (optional)', required: false, type: 'textarea' },
      ];
      const bookingData: Record<string, string> = {};
      for (const f of fields) {
        const val = String(body[f.key] || '').trim();
        if (f.required && !val) { ctx.set.status = 400; return { error: `${f.label} is required` }; }
        if (val) bookingData[f.key] = val;
      }
      bookingData['email'] = emailVal;
      if (ev.bookingType === 'availability') {
        bookingData['slotDate'] = slotDate;
        bookingData['slotTime'] = slotTime;
        bookingData['slotEnd'] = slotEnd;
      }

      const booking = bookingRepo().create({
        eventId: id,
        name: bookingData['name'] || emailVal.split('@')[0] || 'Guest',
        email: emailVal,
        data: bookingData,
      });
      const saved = await bookingRepo().save(booking);

      createActivityLog({ userId: ev.userId || ctx.user?.id, action: 'calendar:event:book', targetId: String(id), targetType: 'calendar-event', metadata: { bookingId: saved.id, email: emailVal, slotDate, slotTime }, ipAddress: ctx.ip }).catch(() => {});

      if (ev.maxCapacity <= 1) {
        ev.appointmentName = booking.name;
        ev.appointmentEmail = booking.email;
        ev.bookingData = bookingData;
        await eventRepo().save(ev);
      }

      if (booking.email && booking.email.includes('@')) {
        const displayDate = ev.bookingType === 'availability' ? slotDate : ev.date;
        const displayStart = ev.bookingType === 'availability' ? slotTime : (ev.startTime ? ev.startTime.slice(0, 5) : '');
        const displayEnd = ev.bookingType === 'availability' ? slotEnd : (ev.endTime ? ev.endTime.slice(0, 5) : '');
        const details = Object.entries(bookingData).map(([k, v]) => `${k}: ${v}`).join('\n');
        let subject = `Booking confirmed: ${ev.title || 'Appointment'}`;
        let title = 'Booking Confirmed';
        if (ev.bookingType === 'rsvp') { subject = `RSVP confirmed: ${ev.title || 'Event'}`; title = 'RSVP Confirmed'; }
        sendMail({
          to: booking.email,
          from: process.env.SMTP_FROM || 'noreply@ecli.app',
          subject,
          template: 'notification',
          vars: {
            title,
            message: `Hi ${bookingData['name'] || 'there'},\n\nYou're confirmed for ${ev.title || (ev.bookingType === 'rsvp' ? 'the event' : 'your appointment')} on ${displayDate}${displayStart ? ` at ${displayStart}–${displayEnd}` : ''}.`,
            details: `${ev.title}\nDate: ${displayDate}${displayStart ? `\nTime: ${displayStart}–${displayEnd}` : ''}\n\n${details}`,
          },
        }).catch((err: any) => console.error('[booking] failed to send confirmation email:', err));
      }

      if (ev.userId) {
        const userRepo = AppDataSource.getRepository(User);
        const owner = await userRepo.findOneBy({ id: ev.userId }).catch(() => null);
        if (owner?.email) {
          const displayDate = ev.bookingType === 'availability' ? slotDate : ev.date;
          const displayStart = ev.bookingType === 'availability' ? slotTime : (ev.startTime ? ev.startTime.slice(0, 5) : '');
          const displayEnd = ev.bookingType === 'availability' ? slotEnd : (ev.endTime ? ev.endTime.slice(0, 5) : '');
          const bookerName = bookingData['name'] || bookingData['email'] || 'Someone';
          const bookerContact = Object.entries(bookingData)
            .filter(([k]) => k !== 'message')
            .map(([k, v]) => `${k}: ${v}`).join('\n');
          const messageText = bookingData['message'] ? `\n\nMessage: ${bookingData['message']}` : '';
          const label = ev.bookingType === 'rsvp' ? 'RSVP' : 'booking';
          sendMail({
            to: owner.email,
            from: process.env.SMTP_FROM || 'noreply@ecli.app',
            subject: `New ${label}: ${ev.title || (ev.bookingType === 'rsvp' ? 'Event' : 'Appointment')} by ${bookerName}`,
            template: 'notification',
            vars: {
              title: `New ${label === 'RSVP' ? 'RSVP' : 'Booking'} Received`,
              message: `${bookerName} ${label === 'RSVP' ? 'RSVP\'d for' : 'booked'} "${ev.title}" on ${displayDate}${displayStart ? ` at ${displayStart}–${displayEnd}` : ''}.`,
              details: `${bookerContact}${messageText}`,
            },
          }).catch((err: any) => console.error('[booking] failed to notify owner:', err));
        }
      }

      return saved;
    },
    {
      detail: { tags: ['Calendar'], summary: 'Book an appointment or RSVP for an event' },
    }
  );

  app.get(
    prefix + '/calendar/events/:id/bookings',
    async (ctx: any) => {
      const isPublic = ctx.query?.public === '1';
      const eventId = Number(ctx.params?.id);
      if (isPublic) {
        const ev = await eventRepo().findOneBy({ id: eventId });
        if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
        const bookings = await AppDataSource.getRepository(CalendarBooking).find({
          where: { eventId },
          order: { createdAt: 'ASC' },
        });
        return { event: ev, bookings, bookingCount: bookings.length };
      }
      const userId = ctx.user?.id;
      const ev = await eventRepo().findOneBy({ id: eventId, userId });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
      const bookings = await AppDataSource.getRepository(CalendarBooking).find({
        where: { eventId },
        order: { createdAt: 'ASC' },
      });
      return { event: ev, bookings, bookingCount: bookings.length };
    },
    {
      detail: { tags: ['Calendar'], summary: 'List bookings for an event' },
    }
  );

  app.delete(
    prefix + '/calendar/events/:id/bookings/:bookingId',
    async (ctx: any) => {
      const eventId = Number(ctx.params?.id);
      const bookingId = Number(ctx.params?.bookingId);
      const ev = await eventRepo().findOneBy({ id: eventId, userId: ctx.user?.id });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
      const bookingRepo = AppDataSource.getRepository(CalendarBooking);
      const booking = await bookingRepo.findOneBy({ id: bookingId, eventId });
      if (!booking) { ctx.set.status = 404; return { error: 'Booking not found' }; }
      await bookingRepo.remove(booking);
      createActivityLog({ userId: ctx.user?.id || ev.userId, action: 'calendar:booking:cancel', targetId: String(eventId), targetType: 'calendar-event', metadata: { bookingId: booking.id, email: booking.email }, ipAddress: ctx.ip }).catch(() => {});
      return { success: true };
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Cancel a booking' },
    }
  );

  app.delete(
    prefix + '/calendar/events/:id',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const id = Number(ctx.params?.id);
      const ev = await eventRepo().findOneBy({ id, userId });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }
      await eventRepo().remove(ev);
      createActivityLog({ userId, action: 'calendar:event:delete', targetId: String(id), targetType: 'calendar-event', metadata: { title: ev.title }, ipAddress: ctx.ip }).catch(() => {});
      return { success: true };
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Delete calendar event' },
    }
  );

  // ── Event notification reminder toggle ──────────────

  app.post(
    prefix + '/calendar/events/:id/notification',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const eventId = Number(ctx.params?.id);
      const { enabled, remindMinutesBefore = 5 } = ctx.body || {};
      const ev = await eventRepo().findOneBy({ id: eventId, userId });
      if (!ev) { ctx.set.status = 404; return { error: 'Event not found' }; }

      const reminderRepo = AppDataSource.getRepository(require('../models/eventReminder.entity').EventReminder);
      if (enabled === false) {
        await reminderRepo.delete({ userId, eventId });
        createActivityLog({ userId, action: 'calendar:notification:disable', targetId: String(eventId), targetType: 'calendar-event', ipAddress: ctx.ip }).catch(() => {});
        return { success: true, enabled: false };
      }
      // Upsert
      const existing = await reminderRepo.findOneBy({ userId, eventId });
      if (existing) {
        existing.remindMinutesBefore = remindMinutesBefore;
        await reminderRepo.save(existing);
      } else {
        await reminderRepo.save(reminderRepo.create({ userId, eventId, remindMinutesBefore }));
      }
      createActivityLog({ userId, action: 'calendar:notification:enable', targetId: String(eventId), targetType: 'calendar-event', metadata: { remindMinutesBefore }, ipAddress: ctx.ip }).catch(() => {});
      return { success: true, enabled: true, remindMinutesBefore };
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Toggle notification reminder for an event' },
    }
  );

  app.get(
    prefix + '/calendar/events/:id/notification',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const eventId = Number(ctx.params?.id);
      const reminderRepo = AppDataSource.getRepository(require('../models/eventReminder.entity').EventReminder);
      const existing = await reminderRepo.findOneBy({ userId, eventId });
      return { enabled: !!existing, remindMinutesBefore: existing?.remindMinutesBefore || 5 };
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Get notification reminder status for an event' },
    }
  );

  app.get(
    prefix + '/calendar/todos',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const todos = await todoRepo().find({
        where: { userId },
        order: { completed: 'ASC', createdAt: 'DESC' },
      });
      return todos;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'List todos' },
    }
  );

  app.post(
    prefix + '/calendar/todos',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const body = ctx.body as any;
      const td = todoRepo().create({
        userId,
        title: String(body.title || '').trim(),
        description: String(body.description || '').trim(),
        priority: String(body.priority || 'medium'),
        dueDate: body.dueDate ? String(body.dueDate) : undefined,
        dueTime: body.dueTime ? String(body.dueTime) : undefined,
        estimatedMinutes: Number(body.estimatedMinutes) || 0,
        weekStart: body.weekStart ? String(body.weekStart) : undefined,
        category: String(body.category || 'general'),
      });
      if (!td.title) { ctx.set.status = 400; return { error: 'Title is required' }; }
      const saved = await todoRepo().save(td);
      ctx.set.status = 201;
      createActivityLog({ userId, action: 'calendar:todo:create', targetId: String(saved.id), targetType: 'calendar-todo', metadata: { title: saved.title }, ipAddress: ctx.ip }).catch(() => {});
      return saved;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Create todo' },
    }
  );

  app.put(
    prefix + '/calendar/todos/:id',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const id = Number(ctx.params?.id);
      const body = ctx.body as any;
      const td = await todoRepo().findOneBy({ id, userId });
      if (!td) { ctx.set.status = 404; return { error: 'Todo not found' }; }
      if (body.title !== undefined) td.title = String(body.title).trim();
      if (body.description !== undefined) td.description = String(body.description).trim();
      if (body.priority !== undefined) td.priority = String(body.priority);
      if (body.dueDate !== undefined) td.dueDate = body.dueDate ? String(body.dueDate) : null;
      if (body.dueTime !== undefined) td.dueTime = body.dueTime ? String(body.dueTime) : null;
      if (body.estimatedMinutes !== undefined) td.estimatedMinutes = Number(body.estimatedMinutes);
      if (body.completed !== undefined) td.completed = Boolean(body.completed);
      if (body.weekStart !== undefined) td.weekStart = String(body.weekStart);
      if (body.category !== undefined) td.category = String(body.category);
      const saved = await todoRepo().save(td);
      createActivityLog({ userId, action: 'calendar:todo:update', targetId: String(id), targetType: 'calendar-todo', metadata: { title: saved.title }, ipAddress: ctx.ip }).catch(() => {});
      return saved;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Update todo' },
    }
  );

  app.delete(
    prefix + '/calendar/todos/:id',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const id = Number(ctx.params?.id);
      const td = await todoRepo().findOneBy({ id, userId });
      if (!td) { ctx.set.status = 404; return { error: 'Todo not found' }; }
      await todoRepo().remove(td);
      createActivityLog({ userId, action: 'calendar:todo:delete', targetId: String(id), targetType: 'calendar-todo', metadata: { title: td.title }, ipAddress: ctx.ip }).catch(() => {});
      return { success: true };
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Delete todo' },
    }
  );

  app.put(
    prefix + '/calendar/todos/:id/toggle',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const id = Number(ctx.params?.id);
      const td = await todoRepo().findOneBy({ id, userId });
      if (!td) { ctx.set.status = 404; return { error: 'Todo not found' }; }
      td.completed = !td.completed;
      const saved = await todoRepo().save(td);
      createActivityLog({ userId, action: 'calendar:todo:toggle', targetId: String(id), targetType: 'calendar-todo', metadata: { title: saved.title, completed: saved.completed }, ipAddress: ctx.ip }).catch(() => {});
      return saved;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Toggle todo completion' },
    }
  );

  app.get(
    prefix + '/calendar/availability-schedules',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const schedules = await scheduleRepo().find({ where: { userId }, order: { createdAt: 'DESC' } });
      return schedules;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'List availability schedules' },
    }
  );

  app.post(
    prefix + '/calendar/availability-schedules',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const body = ctx.body as any;
      const slug = generateSlug();
      const schedule = scheduleRepo().create({
        userId,
        name: String(body.name || '').trim(),
        description: String(body.description || '').trim(),
        slug,
        slotDuration: Number(body.slotDuration) || 60,
        bufferMinutes: Number(body.bufferMinutes) || 0,
        availableStartTime: String(body.availableStartTime || '09:00'),
        availableEndTime: String(body.availableEndTime || '17:00'),
        availableDays: Array.isArray(body.availableDays) ? body.availableDays : [1,2,3,4,5],
        bookingStartDate: body.bookingStartDate ? String(body.bookingStartDate) : undefined,
        bookingEndDate: body.bookingEndDate ? String(body.bookingEndDate) : undefined,
        maxCapacity: Number(body.maxCapacity) || 1,
        bookingFields: Array.isArray(body.bookingFields) ? body.bookingFields : undefined,
        color: String(body.color || '#8b5cf6'),
        active: body.active !== false,
      });
      if (!schedule.name) { ctx.set.status = 400; return { error: 'Name is required' }; }
      const saved = await scheduleRepo().save(schedule);
      ctx.set.status = 201;
      createActivityLog({ userId, action: 'calendar:schedule:create', targetId: String(saved.id), targetType: 'calendar-schedule', metadata: { name: saved.name }, ipAddress: ctx.ip }).catch(() => {});
      return saved;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Create availability schedule' },
    }
  );

  app.put(
    prefix + '/calendar/availability-schedules/:id',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const id = Number(ctx.params?.id);
      const body = ctx.body as any;
      const s = await scheduleRepo().findOneBy({ id, userId });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }
      if (body.name !== undefined) s.name = String(body.name).trim();
      if (body.description !== undefined) s.description = String(body.description).trim();
      if (body.slotDuration !== undefined) s.slotDuration = Number(body.slotDuration);
      if (body.bufferMinutes !== undefined) s.bufferMinutes = Number(body.bufferMinutes);
      if (body.availableStartTime !== undefined) s.availableStartTime = String(body.availableStartTime);
      if (body.availableEndTime !== undefined) s.availableEndTime = String(body.availableEndTime);
      if (body.availableDays !== undefined) s.availableDays = Array.isArray(body.availableDays) ? body.availableDays : null;
      if (body.bookingStartDate !== undefined) s.bookingStartDate = body.bookingStartDate ? String(body.bookingStartDate) : null;
      if (body.bookingEndDate !== undefined) s.bookingEndDate = body.bookingEndDate ? String(body.bookingEndDate) : null;
      if (body.maxCapacity !== undefined) s.maxCapacity = Number(body.maxCapacity);
      if (body.bookingFields !== undefined) s.bookingFields = Array.isArray(body.bookingFields) ? body.bookingFields : null;
      if (body.color !== undefined) s.color = String(body.color);
      if (body.active !== undefined) s.active = Boolean(body.active);
      const saved = await scheduleRepo().save(s);
      createActivityLog({ userId, action: 'calendar:schedule:update', targetId: String(id), targetType: 'calendar-schedule', metadata: { name: saved.name }, ipAddress: ctx.ip }).catch(() => {});
      return saved;
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Update availability schedule' },
    }
  );

  app.delete(
    prefix + '/calendar/availability-schedules/:id',
    async (ctx: any) => {
      const userId = ctx.user.id;
      const id = Number(ctx.params?.id);
      const s = await scheduleRepo().findOneBy({ id, userId });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found' }; }
      await scheduleRepo().remove(s);
      createActivityLog({ userId, action: 'calendar:schedule:delete', targetId: String(id), targetType: 'calendar-schedule', metadata: { name: s.name }, ipAddress: ctx.ip }).catch(() => {});
      return { success: true };
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Delete availability schedule' },
    }
  );

  app.get(
    prefix + '/calendar/availability/s/:slug',
    async (ctx: any) => {
      const slug = String(ctx.params?.slug || '');
      const s = await scheduleRepo().findOneBy({ slug, active: true });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found or inactive' }; }
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        slug: s.slug,
        slotDuration: s.slotDuration,
        bufferMinutes: s.bufferMinutes,
        availableStartTime: s.availableStartTime,
        availableEndTime: s.availableEndTime,
        availableDays: s.availableDays,
        bookingStartDate: s.bookingStartDate,
        bookingEndDate: s.bookingEndDate,
        maxCapacity: s.maxCapacity,
        bookingFields: s.bookingFields,
        color: s.color,
        bookingCount: 0,
      };
    },
    {
      detail: { tags: ['Calendar'], summary: 'Get availability schedule info (public)' },
    }
  );

  app.get(
    prefix + '/calendar/availability/s/:slug/available-slots',
    async (ctx: any) => {
      const slug = String(ctx.params?.slug || '');
      const s = await scheduleRepo().findOneBy({ slug, active: true });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found or inactive' }; }

      const slotDuration = s.slotDuration || 60;
      const bufferMinutes = s.bufferMinutes || 0;
      const startTime = s.availableStartTime || '09:00';
      const endTime = s.availableEndTime || '17:00';
      const days = s.availableDays && s.availableDays.length > 0 ? s.availableDays : [1,2,3,4,5];
      const startDate = s.bookingStartDate || (() => {
        const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      const endDate = s.bookingEndDate || (() => {
        const d = new Date(startDate); d.setDate(d.getDate() + 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();

      const bookingRepo = AppDataSource.getRepository(CalendarBooking);
      const allBookings = await bookingRepo.find({ where: { scheduleId: s.id } });

      function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
      function pad2(n: number) { return String(n).padStart(2, '0'); }

      const slots: { date: string; time: string; endTime: string; available: boolean }[] = [];
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (!days.includes(d.getDay())) continue;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayMins = toMins(startTime);
        const dayEndMins = toMins(endTime);
        let slotStart = dayMins;
        while (slotStart + slotDuration <= dayEndMins) {
          const slotEnd = slotStart + slotDuration;
          const slotTime = `${pad2(Math.floor(slotStart / 60))}:${pad2(slotStart % 60)}`;
          const slotEndStr = `${pad2(Math.floor(slotEnd / 60))}:${pad2(slotEnd % 60)}`;
          const isPast = dateStr < todayLocal || (dateStr === todayLocal && slotStart <= now.getHours() * 60 + now.getMinutes());
          const bookedCount = allBookings.filter((b: any) => {
            const bd = b.data || {};
            return bd.slotDate === dateStr && bd.slotTime === slotTime;
          }).length;
          const available = !isPast && (s.maxCapacity <= 0 || bookedCount < s.maxCapacity);
          slots.push({ date: dateStr, time: slotTime, endTime: slotEndStr, available });
          slotStart += slotDuration + bufferMinutes;
        }
      }

      const grouped: Record<string, { time: string; endTime: string; available: boolean }[]> = {};
      for (const sl of slots) {
        if (!grouped[sl.date]) grouped[sl.date] = [];
        grouped[sl.date].push({ time: sl.time, endTime: sl.endTime, available: sl.available });
      }
      return { slots: grouped, timezone: 'local' };
    },
    {
      detail: { tags: ['Calendar'], summary: 'Get available time slots (public)' },
    }
  );

  app.post(
    prefix + '/calendar/availability/s/:slug/book',
    async (ctx: any) => {
      const slug = String(ctx.params?.slug || '');
      const body = ctx.body as any;
      const s = await scheduleRepo().findOneBy({ slug, active: true });
      if (!s) { ctx.set.status = 404; return { error: 'Schedule not found or inactive' }; }

      const bookingRepo = AppDataSource.getRepository(CalendarBooking);

      const emailVal = String(body.email || body['email'] || '').trim();
      if (!emailVal || !emailVal.includes('@')) {
        ctx.set.status = 400;
        return { error: 'A valid email is required to book' };
      }

      const slotDate = String(body.slotDate || '').trim();
      const slotTime = String(body.slotTime || '').trim();
      if (!slotDate || !slotTime) {
        ctx.set.status = 400;
        return { error: 'Please select a date and time slot' };
      }

      // Validate slot exists and is available
      const slotDuration = s.slotDuration || 60;
      const bufferMinutes = s.bufferMinutes || 0;
      const availStartTime = s.availableStartTime || '09:00';
      const availEndTime = s.availableEndTime || '17:00';
      function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
      function pad2(n: number) { return String(n).padStart(2, '0'); }
      const days = s.availableDays && s.availableDays.length > 0 ? s.availableDays : [1,2,3,4,5];
      const slotDateObj = new Date(slotDate);
      if (!days.includes(slotDateObj.getDay())) {
        ctx.set.status = 400; return { error: 'Selected date is not available' };
      }
      const dayMins = toMins(availStartTime);
      const dayEndMins = toMins(availEndTime);
      let slotEnd = '';
      let valid = false;
      let ss = dayMins;
      while (ss + slotDuration <= dayEndMins) {
        const t = `${pad2(Math.floor(ss / 60))}:${pad2(ss % 60)}`;
        if (t === slotTime) { slotEnd = `${pad2(Math.floor((ss + slotDuration) / 60))}:${pad2((ss + slotDuration) % 60)}`; valid = true; break; }
        ss += slotDuration + bufferMinutes;
      }
      if (!valid) {
        ctx.set.status = 400; return { error: 'Invalid time slot selected' };
      }

      const existingBookings = await bookingRepo.find({ where: { scheduleId: s.id } });
      const bookedOnSlot = existingBookings.filter((b: any) => {
        const bd = b.data || {};
        return bd.slotDate === slotDate && bd.slotTime === slotTime;
      }).length;
      if (s.maxCapacity > 0 && bookedOnSlot >= s.maxCapacity) {
        ctx.set.status = 400; return { error: 'This time slot is already fully booked' };
      }
      const sameEmail = existingBookings.find((b: any) => b.email === emailVal);
      if (sameEmail) {
        ctx.set.status = 400; return { error: 'You already have a booking for this schedule' };
      }

      const fields = s.bookingFields && s.bookingFields.length > 0 ? s.bookingFields : [
        { key: 'name', label: 'Name', required: true, type: 'text' },
        { key: 'email', label: 'Email', required: true, type: 'email' },
        { key: 'message', label: 'Message (optional)', required: false, type: 'textarea' },
      ];
      const bookingData: Record<string, string> = {};
      for (const f of fields) {
        const val = String(body[f.key] || '').trim();
        if (f.required && !val) { ctx.set.status = 400; return { error: `${f.label} is required` }; }
        if (val) bookingData[f.key] = val;
      }
      bookingData['email'] = emailVal;
      bookingData['slotDate'] = slotDate;
      bookingData['slotTime'] = slotTime;
      bookingData['slotEnd'] = slotEnd;

      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (slotDate < todayLocal || (slotDate === todayLocal && toMins(slotTime) <= now.getHours() * 60 + now.getMinutes())) {
        ctx.set.status = 400;
        return { error: 'This time slot has already passed' };
      }

      const booking = bookingRepo.create({
        scheduleId: s.id,
        name: bookingData['name'] || emailVal.split('@')[0] || 'Guest',
        email: emailVal,
        data: bookingData,
      });
      const saved = await bookingRepo.save(booking);

      const fieldLines = Object.entries(bookingData)
        .filter(([k]) => !['slotDate', 'slotTime', 'slotEnd', 'email'].includes(k))
        .map(([k, v]) => `${k}: ${v}`).join('\n');
      const hostDescription = `Schedule: ${s.name}\nDate: ${slotDate}\nTime: ${slotTime}–${slotEnd}\nEmail: ${emailVal}\n${fieldLines}`;

      const hostEvent = eventRepo().create({
        userId: s.userId,
        title: `${s.name} - ${bookingData['name'] || emailVal.split('@')[0] || 'Booking'}`,
        description: hostDescription,
        date: slotDate,
        startTime: slotTime,
        endTime: slotEnd,
        color: s.color || '#8b5cf6',
        isAppointment: true,
        appointmentEmail: emailVal,
        appointmentName: bookingData['name'] || 'Guest',
        bookingData,
      });
      const createdEvent = await eventRepo().save(hostEvent);

      saved.eventId = createdEvent.id;
      await bookingRepo.save(saved);

      if (emailVal) {
        const details = Object.entries(bookingData).map(([k, v]) => `${k}: ${v}`).join('\n');
        sendMail({
          to: emailVal,
          from: process.env.SMTP_FROM || 'noreply@ecli.app',
          subject: `Booking confirmed: ${s.name}`,
          template: 'notification',
          vars: {
            title: 'Booking Confirmed',
            message: `Hi ${bookingData['name'] || 'there'},\n\nYou're confirmed for "${s.name}" on ${slotDate} at ${slotTime}–${slotEnd}.`,
            details: `Schedule: ${s.name}\nDate: ${slotDate}\nTime: ${slotTime}–${slotEnd}\n\n${details}`,
          },
        }).catch((err: any) => console.error('[schedule booking] failed to send confirmation email:', err));
      }

      if (s.userId) {
        const userRepo = AppDataSource.getRepository(User);
        const owner = await userRepo.findOneBy({ id: s.userId }).catch(() => null);
        if (owner?.email) {
          const bookerName = `${bookingData['name'] || emailVal.split('@')[0] || 'Guest'} (${emailVal})`;
          const bookerContact = Object.entries(bookingData)
            .filter(([k]) => k !== 'message')
            .map(([k, v]) => `${k}: ${v}`).join('\n');
          const messageText = bookingData['message'] ? `\n\nMessage: ${bookingData['message']}` : '';
          sendMail({
            to: owner.email,
            from: process.env.SMTP_FROM || 'noreply@ecli.app',
            subject: `New booking: ${s.name} by ${bookerName}`,
            template: 'notification',
            vars: {
              title: 'New Booking Received',
              message: `${bookerName} booked "${s.name}" on ${slotDate} at ${slotTime}–${slotEnd}.`,
              details: `${bookerContact}${messageText}`,
            },
          }).catch((err: any) => console.error('[schedule booking] failed to notify host:', err));
        }
      }

      return { success: true, booking: saved, eventId: createdEvent.id };
    },
    {
      detail: { tags: ['Calendar'], summary: 'Book a slot on an availability schedule (public)' },
    }
  );

  app.get(
    prefix + '/calendar/system-events',
    async (ctx: any) => {
      const rawCountry = (ctx.query?.country as string) || 'US';
      const rawYear = (ctx.query?.year as string) || String(new Date().getFullYear());
      const country = rawCountry.toUpperCase();

      if (!HOLIDAY_COUNTRY_RE.test(country)) return { error: 'Invalid country code' };
      if (!HOLIDAY_YEAR_RE.test(rawYear)) return { error: 'Invalid year' };

      const cacheKey = `${country}/${rawYear}`;
      const cached = holidayCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < HOLIDAY_CACHE_TTL) {
        return cached.data;
      }

      try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${rawYear}/${country}`);
        if (!res.ok) return [];
        const holidays = await res.json();
        const mapped = holidays.map((h: any) => ({
          id: `sys-${h.date}`,
          date: h.date,
          title: h.localName || h.name,
          description: h.name,
          countryCode: h.countryCode,
          type: 'holiday',
          fixed: h.fixed,
          global: h.global,
          counties: h.counties,
          launchYear: h.launchYear,
        }));
        holidayCache.set(cacheKey, { data: mapped, ts: Date.now() });
        return mapped;
      } catch {
        return [];
      }
    },
    {
      beforeHandle: [authenticate, calendarRollout],
      detail: { tags: ['Calendar'], summary: 'Get system events (holidays, country events)' },
    }
  );
}