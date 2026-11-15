-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('ADMIN', 'STAFF', 'VIEWER', 'COST_VIEWER');

-- CreateEnum
CREATE TYPE "PortalUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('ACTIVATE', 'LOGIN', 'RESET');

-- CreateTable
CREATE TABLE "supplier_credentials" (
    "id" SERIAL NOT NULL,
    "crmSupplierId" INTEGER NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "apiKeyEnc" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_users" (
    "id" SERIAL NOT NULL,
    "credentialId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "PortalRole" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "passwordHash" TEXT,
    "status" "PortalUserStatus" NOT NULL DEFAULT 'INVITED',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_sessions" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_device_tokens" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_otp_codes" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_invites" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'ACTIVATE',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_login_attempts" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_audit" (
    "id" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" INTEGER,
    "supplierId" INTEGER,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_used_nonces" (
    "nonce" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_used_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_credentials_crmSupplierId_key" ON "supplier_credentials"("crmSupplierId");

-- CreateIndex
CREATE INDEX "supplier_users_email_idx" ON "supplier_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_users_credentialId_email_key" ON "supplier_users"("credentialId", "email");

-- CreateIndex
CREATE INDEX "portal_sessions_userId_idx" ON "portal_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_device_tokens_tokenHash_key" ON "portal_device_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_device_tokens_userId_idx" ON "portal_device_tokens"("userId");

-- CreateIndex
CREATE INDEX "portal_otp_codes_userId_purpose_idx" ON "portal_otp_codes"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "portal_invites_tokenHash_key" ON "portal_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "portal_login_attempts_email_at_idx" ON "portal_login_attempts"("email", "at");

-- CreateIndex
CREATE INDEX "portal_login_attempts_ip_at_idx" ON "portal_login_attempts"("ip", "at");

-- CreateIndex
CREATE INDEX "portal_audit_supplierId_at_idx" ON "portal_audit"("supplierId", "at");

-- CreateIndex
CREATE INDEX "portal_audit_userId_at_idx" ON "portal_audit"("userId", "at");

-- CreateIndex
CREATE INDEX "portal_used_nonces_seenAt_idx" ON "portal_used_nonces"("seenAt");

-- AddForeignKey
ALTER TABLE "supplier_users" ADD CONSTRAINT "supplier_users_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "supplier_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "supplier_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_device_tokens" ADD CONSTRAINT "portal_device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "supplier_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_otp_codes" ADD CONSTRAINT "portal_otp_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "supplier_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_invites" ADD CONSTRAINT "portal_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "supplier_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
