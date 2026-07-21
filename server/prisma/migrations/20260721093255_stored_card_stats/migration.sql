-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "remainingPoints" INTEGER NOT NULL DEFAULT 0,
    "expireAt" DATETIME,
    "subscriptionUntil" DATETIME,
    "plan" TEXT,
    "boundFingerprint" TEXT,
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storedCardTotal" INTEGER NOT NULL DEFAULT 0,
    "storedCardDisabled" INTEGER NOT NULL DEFAULT 0,
    "storedCardPurchased" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("boundFingerprint", "createdAt", "disabledAt", "expireAt", "id", "passwordHash", "plan", "remainingPoints", "subscriptionUntil", "username") SELECT "boundFingerprint", "createdAt", "disabledAt", "expireAt", "id", "passwordHash", "plan", "remainingPoints", "subscriptionUntil", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
