import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1735000000000 implements MigrationInterface {
  name = 'InitSchema1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Enum types (real Postgres enums, not varchar) ---
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('customer', 'agent', 'admin')
    `);
    await queryRunner.query(`
      CREATE TYPE "tickets_status_enum" AS ENUM ('open', 'in_progress', 'resolved', 'closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "tickets_priority_enum" AS ENUM ('low', 'normal', 'high', 'urgent')
    `);

    // --- users ---
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR NOT NULL,
        "password_hash" VARCHAR NOT NULL,
        "full_name" VARCHAR NOT NULL,
        "role" "users_role_enum" NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // --- tickets ---
    await queryRunner.query(`
      CREATE TABLE "tickets" (
        "id" SERIAL PRIMARY KEY,
        "subject" VARCHAR NOT NULL,
        "body" TEXT NOT NULL,
        "status" "tickets_status_enum" NOT NULL DEFAULT 'open',
        "priority" "tickets_priority_enum" NOT NULL,
        "requester_id" INTEGER NOT NULL,
        "assignee_id" INTEGER,
        "due_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_tickets_requester" FOREIGN KEY ("requester_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_tickets_assignee" FOREIGN KEY ("assignee_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_requester" ON "tickets" ("requester_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_assignee" ON "tickets" ("assignee_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_status" ON "tickets" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_priority" ON "tickets" ("priority")`);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_due_at" ON "tickets" ("due_at")`);

    // --- comments ---
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" SERIAL PRIMARY KEY,
        "ticket_id" INTEGER NOT NULL,
        "author_id" INTEGER NOT NULL,
        "body" TEXT NOT NULL,
        "is_internal" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_comments_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_author" FOREIGN KEY ("author_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_comments_ticket" ON "comments" ("ticket_id")`);

    // --- tags ---
    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR NOT NULL,
        CONSTRAINT "UQ_tags_name" UNIQUE ("name")
      )
    `);

    // --- ticket_tags (join table, composite PK) ---
    await queryRunner.query(`
      CREATE TABLE "ticket_tags" (
        "ticket_id" INTEGER NOT NULL,
        "tag_id" INTEGER NOT NULL,
        CONSTRAINT "PK_ticket_tags" PRIMARY KEY ("ticket_id", "tag_id"),
        CONSTRAINT "FK_ticket_tags_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ticket_tags_tag" FOREIGN KEY ("tag_id")
          REFERENCES "tags"("id") ON DELETE CASCADE
      )
    `);

    // --- ticket_events (audit trail) ---
    await queryRunner.query(`
      CREATE TABLE "ticket_events" (
        "id" SERIAL PRIMARY KEY,
        "ticket_id" INTEGER NOT NULL,
        "actor_id" INTEGER,
        "from_status" "tickets_status_enum",
        "to_status" "tickets_status_enum",
        "note" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_ticket_events_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ticket_events_actor" FOREIGN KEY ("actor_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ticket_events_ticket" ON "ticket_events" ("ticket_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order: drop dependents before the tables they reference.
    await queryRunner.query(`DROP TABLE "ticket_events"`);
    await queryRunner.query(`DROP TABLE "ticket_tags"`);
    await queryRunner.query(`DROP TABLE "tags"`);
    await queryRunner.query(`DROP TABLE "comments"`);
    await queryRunner.query(`DROP TABLE "tickets"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "tickets_priority_enum"`);
    await queryRunner.query(`DROP TYPE "tickets_status_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
