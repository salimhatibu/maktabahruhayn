import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010134929 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "payment_request" ("id" text not null, "phone" text not null, "amount" integer not null, "currency_code" text not null default 'kes', "reference" text not null, "description" text null, "order_id" text null, "status" text check ("status" in ('pending', 'paid', 'failed', 'cancelled')) not null default 'pending', "checkout_request_id" text null, "mpesa_receipt" text null, "result_description" text null, "created_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payment_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_request_deleted_at" ON "payment_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_request_checkout_request_id" ON "payment_request" ("checkout_request_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_request_status" ON "payment_request" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payment_request" cascade;`);
  }

}
