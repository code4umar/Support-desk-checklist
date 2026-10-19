import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCannedReplies1790600000000 implements MigrationInterface {
  name = 'AddCannedReplies1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "canned_replies" (
        "id" SERIAL PRIMARY KEY,
        "title" character varying(80) NOT NULL,
        "body" text NOT NULL,
        "created_by" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    // three starter replies so the feature is useful straight away.
    // {{name}} and {{agent}} are filled in when a reply is inserted.
    await queryRunner.query(
      `INSERT INTO "canned_replies" ("title", "body") VALUES
        ($1, $2), ($3, $4), ($5, $6)`,
      [
        'Thanks for reaching out',
        'Hi {{name}},\n\nThanks for contacting us. We have received your request and are looking into it now. I will update you as soon as I have more information.\n\nBest regards,\n{{agent}}',
        'Need more details',
        'Hi {{name}},\n\nTo help us fix this quickly, could you share a few more details? For example, what you were doing when it happened, any error message you saw, and a screenshot if you have one.\n\nThanks,\n{{agent}}',
        'Issue resolved',
        'Hi {{name}},\n\nGood news: this issue has been resolved. Please try again and let us know if anything still looks wrong. We will keep the ticket open for a few days in case you need us.\n\nBest regards,\n{{agent}}',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "canned_replies"`);
  }
}
