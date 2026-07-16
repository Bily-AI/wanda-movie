-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unactivated',
    "boundDeviceId" INTEGER,
    "activatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Device" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fingerprint" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "remainingPoints" INTEGER NOT NULL,
    "expireAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Device_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointLedger_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_code_key" ON "Card"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Device_fingerprint_key" ON "Device"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "PointLedger_orderId_key" ON "PointLedger"("orderId");
