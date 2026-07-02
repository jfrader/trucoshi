-- CreateTable
CREATE TABLE "AdminNoticeBanner" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "buttonText" TEXT,
    "buttonHref" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedByAccountId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminNoticeBanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminNoticeBanner_active_idx" ON "AdminNoticeBanner"("active");

-- CreateIndex
CREATE INDEX "AdminNoticeBanner_updatedAt_idx" ON "AdminNoticeBanner"("updatedAt");
