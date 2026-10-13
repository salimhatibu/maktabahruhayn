import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010184118 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "newsletter_subscriber" add column if not exists "name" text null, add column if not exists "phone" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "newsletter_subscriber" drop column if exists "name", drop column if exists "phone";`);
  }

}
