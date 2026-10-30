import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

// Long-running server (local dev, Railway, Render...). Vercel uses vercel.ts instead.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Support Desk API running on port ${port}`);
}
bootstrap();
