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
  // abortOnError: false — by default Nest kills the process when startup fails,
  // which on Vercel is a bare FUNCTION_INVOCATION_FAILED; throw instead so the
  // handler below can answer with the reason
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'], abortOnError: false });
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
  let app: Handler;
  try {
    app = await ready;
  } catch (err) {
    // Say why instead of a bare FUNCTION_INVOCATION_FAILED. The message is the
    // driver's (e.g. "connect ECONNREFUSED 127.0.0.1:5432"); it never contains
    // the password.
    console.error('API failed to start:', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'error', message: 'API failed to start', reason: (err as Error).message }));
    return;
  }
  app(req, res);
}
