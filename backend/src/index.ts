import 'reflect-metadata';
import app, { initApp } from './app';
import { AppDataSource } from './config/typeorm';
import { redisClient } from './config/redis';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

let server: any = null;

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } catch {
    // uwu
  }
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  } catch {
    // awe
  }
  try {
    redisClient.close?.();
  } catch {
    // owo
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

(async () => {
  try {
    process.on('unhandledRejection', (reason: any, p: any) => {
      try {
        if (app && (app as any).log && typeof (app as any).log.error === 'function') {
          (app as any).log.error({ reason, promise: String(p) }, 'unhandledRejection');
        } else {
          console.error('unhandledRejection', reason, p);
        }
      } catch (e) {
        console.error('unhandledRejection logging failed', e);
      }
    });

    process.on('uncaughtException', (err: any) => {
      try {
        if (app && (app as any).log && typeof (app as any).log.error === 'function') {
          (app as any).log.error(err, 'uncaughtException');
        } else {
          console.error('uncaughtException', err);
        }
      } catch (e) {
        console.error('uncaughtException logging failed', e);
      }
      if (process.env.EXIT_ON_UNCAUGHT === '1') process.exit(1);
    });

    await initApp();
    await import('./handlers/chatHandler').then(m => m.ensureLuminosChannel()).catch(() => {});
    server = await (app as any).listen({ port: Number(PORT), host: String(HOST) });
    app.log.info(`Server listening at ${HOST}:${PORT}`);
  } catch (err) {
    if (app && (app as any).log && typeof (app as any).log.error === 'function') {
      (app as any).log.error(err);
    } else {
      console.error('startup error', err);
    }
    process.exit(1);
  }
})();
