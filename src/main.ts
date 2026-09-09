import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Support Desk API running on port ${port}`);
}
bootstrap();
