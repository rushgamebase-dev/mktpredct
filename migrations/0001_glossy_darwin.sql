CREATE TYPE "public"."market_type" AS ENUM('classic', 'counter', 'price', 'event');--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "market_type" "market_type" DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "source_config" jsonb DEFAULT '{}';