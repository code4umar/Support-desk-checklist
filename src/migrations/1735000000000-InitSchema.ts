import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1757400000000 implements MigrationInterface {
  name = 'InitSchema1757400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum types
    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('customer', 'agent', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "tickets_status_enum" AS ENUM ('open', 'in_progress', 'resolved', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "tickets_priority_enum" AS ENUM ('low', 'normal', 'high', 'urgent')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar NOT NULL UNIQUE,
        "password_hash" varchar NOT NULL,
        "full_name" varchar NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'customer',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tickets" (
        "id" SERIAL PRIMARY KEY,
        "subject" varchar NOT NULL,
        "body" text NOT NULL,
        "status" "tickets_status_enum" NOT NULL DEFAULT 'open',
        "priority" "tickets_priority_enum" NOT NULL DEFAULT 'normal',
        "requester_id" integer NOT NULL,
        "assignee_id" integer,
        "due_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_tickets_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tickets_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" SERIAL PRIMARY KEY,
        "ticket_id" integer NOT NULL,
        "author_id" integer NOT NULL,
        "body" text NOT NULL,
        "is_internal" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_comments_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL UNIQUE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ticket_tags" (
        "ticket_id" integer NOT NULL,
        "tag_id" integer NOT NULL,
        PRIMARY KEY ("ticket_id", "tag_id"),
        CONSTRAINT "FK_ticket_tags_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ticket_tags_tag" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ticket_events" (
        "id" SERIAL PRIMARY KEY,
        "ticket_id" integer NOT NULL,
        "actor_id" integer,
        "from_status" varchar,
        "to_status" varchar,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_ticket_events_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ticket_events_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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