import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

// Everything the app needs besides "listen on a port". Shared by main.ts
// (a normal long-running server) and vercel.ts (serverless), so both behave
// exactly the same.
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global validation: strips unknown properties (whitelist) and REJECTS
  // requests that include them (forbidNonWhitelisted). This is what makes
  // a stray `dueAt` in a create-ticket body come back as 400 (rule 8).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS_ORIGIN may list several origins, comma separated
  // (e.g. "https://trydeskly.vercel.app,http://localhost:3000").
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length === 1 ? origins[0] : origins });
}
