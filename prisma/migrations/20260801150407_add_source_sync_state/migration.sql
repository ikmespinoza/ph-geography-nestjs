-- CreateTable
CREATE TABLE "source_sync_state" (
    "id" SERIAL NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "resource" VARCHAR(20) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_sync_state_source_resource_key" ON "source_sync_state"("source", "resource");
