import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketRatings1790500000000 implements MigrationInterface {
  name = 'AddTicketRatings1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ticket_ratings" (
        "id" SERIAL PRIMARY KEY,
        "ticket_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "stars" smallint NOT NULL CHECK ("stars" BETWEEN 1 AND 5),
        "comment" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    // one rating per ticket (rating again just updates it)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ticket_ratings_ticket" ON "ticket_ratings" ("ticket_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ticket_ratings_ticket"`);
    await queryRunner.query(`DROP TABLE "ticket_ratings"`);
  }
}
