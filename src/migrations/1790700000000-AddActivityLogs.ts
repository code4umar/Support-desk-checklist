import { MigrationInterface, QueryRunner } from "typeorm";

export class AddActivityLogs1790700000000 implements MigrationInterface {
    name = 'AddActivityLogs1790700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "activity_logs" (
            "id" SERIAL NOT NULL,
            "actor_id" integer,
            "action" character varying(60) NOT NULL,
            "target_type" character varying(40),
            "target_id" integer,
            "details" text,
            "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_activity_logs_id" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`CREATE INDEX "IDX_activity_logs_created_at" ON "activity_logs" ("created_at")`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD CONSTRAINT "FK_activity_logs_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT "FK_activity_logs_actor"`);
        await queryRunner.query(`DROP INDEX "IDX_activity_logs_created_at"`);
        await queryRunner.query(`DROP TABLE "activity_logs"`);
    }
}
