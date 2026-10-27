import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTicketAttachments1790800000000 implements MigrationInterface {
    name = 'AddTicketAttachments1790800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ticket_attachments" (
            "id" SERIAL NOT NULL,
            "ticket_id" integer NOT NULL,
            "uploaded_by" integer,
            "filename" character varying(255) NOT NULL,
            "mime_type" character varying(100) NOT NULL,
            "size" integer NOT NULL,
            "data" bytea NOT NULL,
            "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_ticket_attachments_id" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`CREATE INDEX "IDX_ticket_attachments_ticket" ON "ticket_attachments" ("ticket_id")`);
        await queryRunner.query(`ALTER TABLE "ticket_attachments" ADD CONSTRAINT "FK_ticket_attachments_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ticket_attachments" ADD CONSTRAINT "FK_ticket_attachments_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ticket_attachments" DROP CONSTRAINT "FK_ticket_attachments_uploader"`);
        await queryRunner.query(`ALTER TABLE "ticket_attachments" DROP CONSTRAINT "FK_ticket_attachments_ticket"`);
        await queryRunner.query(`DROP INDEX "IDX_ticket_attachments_ticket"`);
        await queryRunner.query(`DROP TABLE "ticket_attachments"`);
    }
}
