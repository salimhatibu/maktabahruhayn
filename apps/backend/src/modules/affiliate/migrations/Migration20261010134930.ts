import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010134930 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "affiliate" drop constraint if exists "affiliate_code_unique";`);
    this.addSql(`create table if not exists "affiliate" ("id" text not null, "code" text not null, "name" text not null, "email" text null, "phone" text null, "commission_percent" integer not null default 10, "active" boolean not null default true, "notes" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "affiliate_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_affiliate_deleted_at" ON "affiliate" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_code_unique" ON "affiliate" ("code") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "affiliate" cascade;`);
  }

}
