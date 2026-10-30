import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoriesAndKnowledgeBase1790900000000 implements MigrationInterface {
  name = 'AddCategoriesAndKnowledgeBase1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // one shared list of categories, used by both tickets and help articles
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" SERIAL PRIMARY KEY,
        "name" character varying(60) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_categories_name_lower" ON "categories" (lower("name"))`);
    await queryRunner.query(
      `INSERT INTO "categories" ("name") VALUES ($1), ($2), ($3), ($4)`,
      ['Account & Login', 'Billing', 'Technical Issue', 'General'],
    );

    // optional on tickets; deleting a category just leaves its tickets uncategorised
    await queryRunner.query(`ALTER TABLE "tickets" ADD "category_id" integer`);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_category_id" ON "tickets" ("category_id")`);
    await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_tickets_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    // help-centre articles; body is Markdown, tags are free-form lowercase words
    await queryRunner.query(`
      CREATE TABLE "kb_articles" (
        "id" SERIAL PRIMARY KEY,
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "tags" text[] NOT NULL DEFAULT '{}',
        "category_id" integer,
        "published" boolean NOT NULL DEFAULT true,
        "author_id" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_kb_articles_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_kb_articles_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_kb_articles_tags" ON "kb_articles" USING GIN ("tags")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "kb_articles"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_tickets_category"`);
    await queryRunner.query(`DROP INDEX "IDX_tickets_category_id"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "category_id"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
