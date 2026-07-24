-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PointLedger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "delta" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "balance" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PointLedger" ("balance", "createdAt", "delta", "id", "orderId", "reason", "userId") SELECT "balance", "createdAt", "delta", "id", "orderId", "reason", "userId" FROM "PointLedger";
DROP TABLE "PointLedger";
ALTER TABLE "new_PointLedger" RENAME TO "PointLedger";
CREATE UNIQUE INDEX "PointLedger_orderId_key" ON "PointLedger"("orderId");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "remainingPoints" REAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_User" ("boundFingerprint", "createdAt", "disabledAt", "expireAt", "id", "passwordHash", "plan", "remainingPoints", "storedCardDisabled", "storedCardPurchased", "storedCardTotal", "subscriptionUntil", "username") SELECT "boundFingerprint", "createdAt", "disabledAt", "expireAt", "id", "passwordHash", "plan", "remainingPoints", "storedCardDisabled", "storedCardPurchased", "storedCardTotal", "subscriptionUntil", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

