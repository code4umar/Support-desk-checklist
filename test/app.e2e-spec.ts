import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

describe('Support Desk (e2e)', () => {
  let app: INestApplication;
  let server: any;

  // Unique per run so re-running the suite never collides with leftover rows.
  const stamp = Date.now();
  const customerAEmail = `e2e-customer-a-${stamp}@test.com`;
  const customerBEmail = `e2e-customer-b-${stamp}@test.com`;
  const password = 'Password123!';

  let customerAToken: string;
  let customerBToken: string;
  let agentToken: string;
  let ticketId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(server).get('/tickets').expect(401);
  });

  it('registers customer A', async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({ email: customerAEmail, password, full_name: 'E2E Customer A' })
      .expect(201);
    expect(res.body.password_hash).toBeUndefined();
  });

  it('rejects registering with a role in the body (whitelist)', async () => {
    await request(server)
      .post('/auth/register')
      .send({
        email: `e2e-sneaky-${stamp}@test.com`,
        password,
        full_name: 'Sneaky',
        role: 'admin',
      })
      .expect(400);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(server)
      .post('/auth/register')
      .send({ email: customerAEmail, password, full_name: 'E2E Customer A' })
      .expect(409);
  });

  it('registers customer B (for the visibility test later)', async () => {
    await request(server)
      .post('/auth/register')
      .send({ email: customerBEmail, password, full_name: 'E2E Customer B' })
      .expect(201);
  });

  it('logs in customer A', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ email: customerAEmail, password })
      .expect(200);
    expect(res.body.access_token).toBeDefined();
    customerAToken = res.body.access_token;
  });

  it('logs in customer B', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ email: customerBEmail, password })
      .expect(200);
    customerBToken = res.body.access_token;
  });

  it('rejects login with a wrong password as 401', async () => {
    await request(server)
      .post('/auth/login')
      .send({ email: customerAEmail, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in the seeded agent (agent1@supportdesk.test)', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ email: 'agent1@supportdesk.test', password: 'Password123!' })
      .expect(200);
    agentToken = res.body.access_token;
  });

  it('returns the signed-in user from /auth/me', async () => {
    const res = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${customerAToken}`)
      .expect(200);
    expect(res.body.email).toBe(customerAEmail);
    expect(res.body.role).toBe('customer');
  });

  it('creates a ticket as customer A', async () => {
    const res = await request(server)
      .post('/tickets')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ subject: 'E2E test ticket', body: 'Something is broken', priority: 'high' })
      .expect(201);
    expect(res.body.status).toBe('open');
    expect(res.body.due_at).toBeDefined();
    ticketId = res.body.id;
  });

  it('rejects a create-ticket body with a dueAt field (whitelist, rule 8)', async () => {
    await request(server)
      .post('/tickets')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({
        subject: 'Trying to sneak a due date',
        body: 'x',
        priority: 'low',
        dueAt: '2099-01-01',
      })
      .expect(400);
  });

  it('lists tickets for customer A, filtered by status, paged', async () => {
    const res = await request(server)
      .get('/tickets')
      .query({ status: 'open', page: 1, pageSize: 5 })
      .set('Authorization', `Bearer ${customerAToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(5);
    expect(res.body.data.some((t: any) => t.id === ticketId)).toBe(true);
  });

  it('lets customer A read their own ticket', async () => {
    await request(server)
      .get(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .expect(200);
  });

  it("hides customer A's ticket from customer B behind a 404", async () => {
    await request(server)
      .get(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${customerBToken}`)
      .expect(404);
  });

  it('forbids a customer from assigning a ticket (403)', async () => {
    await request(server)
      .post(`/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ assigneeId: 1 })
      .expect(403);
  });

  it('lets an agent assign the ticket', async () => {
    // agent1 is seeded with id 2 in a fresh seed run; fetch it defensively via /auth/me instead of hardcoding.
    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);

    await request(server)
      .post(`/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ assigneeId: me.body.id })
      .expect(200);
  });

  it('rejects assigning a customer as the assignee (422)', async () => {
    const meA = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${customerAToken}`)
      .expect(200);

    await request(server)
      .post(`/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ assigneeId: meA.body.id })
      .expect(422);
  });

  it('moves the ticket open -> in_progress legally', async () => {
    const res = await request(server)
      .post(`/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'in_progress' })
      .expect(200);
    expect(res.body.status).toBe('in_progress');
  });

  it('rejects an illegal status move with 409', async () => {
    await request(server)
      .post(`/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'closed' }) // in_progress -> closed is not legal
      .expect(409);
  });

  it('lets customer A post a comment', async () => {
    await request(server)
      .post(`/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ body: 'Any update on this?' })
      .expect(201);
  });

  it('forbids a customer from posting an internal comment (403)', async () => {
    await request(server)
      .post(`/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ body: 'sneaky internal note', isInternal: true })
      .expect(403);
  });

  it('lets the agent post an internal comment, hidden from the customer', async () => {
    await request(server)
      .post(`/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'internal-only note for the team', isInternal: true })
      .expect(201);

    const asCustomer = await request(server)
      .get(`/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .expect(200);
    expect(asCustomer.body.every((c: any) => c.is_internal === false)).toBe(true);

    const asAgent = await request(server)
      .get(`/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(asAgent.body.some((c: any) => c.is_internal === true)).toBe(true);
  });

  it('records the audit trail — events exist for the assignment and the status change', async () => {
    const res = await request(server)
      .get(`/tickets/${ticketId}/events`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("hides the ticket's events from customer B (404)", async () => {
    await request(server)
      .get(`/tickets/${ticketId}/events`)
      .set('Authorization', `Bearer ${customerBToken}`)
      .expect(404);
  });
});
