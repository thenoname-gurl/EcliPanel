import 'reflect-metadata';
import app, { initApp } from './app';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
(async () => {
  try {
    await initApp();
    await app.listen({ port: Number(PORT), host: String(HOST) });
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