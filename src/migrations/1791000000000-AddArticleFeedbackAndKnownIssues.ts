import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArticleFeedbackAndKnownIssues1791000000000 implements MigrationInterface {
  name = 'AddArticleFeedbackAndKnownIssues1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // "Was this helpful?" votes. source = where the vote was cast:
    // 'article' (the article page) or 'ticket_form' (a suggestion on the
    // new-ticket form; a yes there is a ticket that never had to be filed).
    await queryRunner.query(`
      CREATE TABLE "kb_feedback" (
        "id" SERIAL PRIMARY KEY,
        "article_id" integer NOT NULL,
        "user_id" integer,
        "helpful" boolean NOT NULL,
        "source" character varying(20) NOT NULL DEFAULT 'article',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_kb_feedback_article" FOREIGN KEY ("article_id") REFERENCES "kb_articles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kb_feedback_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    // one vote per person, article and place; voting again changes the vote
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_kb_feedback_vote" ON "kb_feedback" ("article_id", "user_id", "source")`);
    await queryRunner.query(`CREATE INDEX "IDX_kb_feedback_created_at" ON "kb_feedback" ("created_at")`);

    // A ticket can point at a "known issue" (another ticket). Resolving the
    // known issue resolves every open ticket linked to it.
    await queryRunner.query(`ALTER TABLE "tickets" ADD "known_issue_id" integer`);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_known_issue_id" ON "tickets" ("known_issue_id")`);
    await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_tickets_known_issue" FOREIGN KEY ("known_issue_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_tickets_known_issue"`);
    await queryRunner.query(`DROP INDEX "IDX_tickets_known_issue_id"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "known_issue_id"`);
    await queryRunner.query(`DROP TABLE "kb_feedback"`);
  }
}
