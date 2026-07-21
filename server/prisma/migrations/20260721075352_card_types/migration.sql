/*
  Warnings:

  - You are about to drop the column `validDays` on the `Card` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "plan" TEXT;
ALTER TABLE "User" ADD COLUMN "subscriptionUntil" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'point',
    "points" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'unused',
    "usedByUserId" INTEGER,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("code", "createdAt", "id", "points", "status", "usedAt", "usedByUserId") SELECT "code", "createdAt", "id", "points", "status", "usedAt", "usedByUserId" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE UNIQUE INDEX "Card_code_key" ON "Card"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
