// Nest and TypeORM load these by name at runtime, which Vercel's file tracer
// can't see; importing them here makes sure they ship with the function.
import '@nestjs/platform-express';
import 'class-validator';
import 'class-transformer';
import 'pg';
import { NestFactory } from '@nestjs/core';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

// Serverless entry point for Vercel (wired up by api/index.js + vercel.json).
// Vercel calls this once per request; the Nest app (and its database
// connection) is created on the first call and reused while the function
// instance stays warm, instead of starting a server with app.listen().

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | null = null;

async function createHandler(): Promise<Handler> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  configureApp(app);
  await app.init();
  // Nest's own Express instance: it handles a request when called like a function
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // a failed start (e.g. database unreachable) is retried on the next request
  ready ??= createHandler().catch((err) => {
    ready = null;
    throw err;
  });
  const app = await ready;
  app(req, res);
}
