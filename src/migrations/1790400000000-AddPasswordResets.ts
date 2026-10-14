import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResets1790400000000 implements MigrationInterface {
  name = 'AddPasswordResets1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_resets" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_password_resets_token_hash" ON "password_resets" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_password_resets_user" ON "password_resets" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_password_resets_user"`);
    await queryRunner.query(`DROP INDEX "IDX_password_resets_token_hash"`);
    await queryRunner.query(`DROP TABLE "password_resets"`);
  }
}