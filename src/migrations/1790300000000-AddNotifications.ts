import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotifications1790300000000 implements MigrationInterface {
    name = 'AddNotifications1790300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notifications" (
            "id" SERIAL NOT NULL,
            "user_id" integer NOT NULL,
            "type" character varying(40) NOT NULL,
            "message" text NOT NULL,
            "ticket_id" integer,
            "actor_id" integer,
            "read_at" TIMESTAMP WITH TIME ZONE,
            "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_user_read" ON "notifications" ("user_id", "read_at")`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_ticket"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_user"`);
        await queryRunner.query(`DROP INDEX "IDX_notifications_user_read"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
    }
}
