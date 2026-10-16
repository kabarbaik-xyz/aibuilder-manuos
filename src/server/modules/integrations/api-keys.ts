import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresInDays?: number;
}

export interface ApiKeyCreatedResult {
  id: string;
  name: string;
  keyPrefix: string;
  rawToken: string;
  scopes: string[];
  expiresAt: string | null;
}

export interface ValidatedApiKey {
  id: string;
  workspaceId: string;
  name: string;
  scopes: string[];
}

export class ApiKeyService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generates a new scoped API Key for external programmatic integrations.
   * The raw secret token is returned exactly once.
   */
  async createApiKey(principal: Principal, input: CreateApiKeyInput): Promise<ApiKeyCreatedResult> {
    requireAnyPermission(principal, ['access.manage', 'workspace.manage', 'audit.read', 'order.release']);

    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestError('API key name is required.');
    }

    if (!input.scopes || input.scopes.length === 0) {
      throw new BadRequestError('At least one permission scope is required.');
    }

    const rawRandom = crypto.randomBytes(24).toString('hex');
    const rawToken = `mos_${rawRandom}`;
    const keyPrefix = rawToken.slice(0, 8);
    const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const record = await this.prisma.apiKey.create({
      data: {
        workspaceId: principal.workspaceId,
        name: input.name.trim(),
        keyPrefix,
        keyHash,
        scopesJson: JSON.stringify(input.scopes),
        isActive: true,
        expiresAt,
      },
    });

    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      rawToken,
      scopes: input.scopes,
      expiresAt: record.expiresAt?.toISOString() || null,
    };
  }

  /**
   * Authenticates and authorizes an inbound API key token against its cryptographic hash.
   */
  async validateApiKey(
    workspaceId: string,
    rawToken: string,
    requiredScope?: string
  ): Promise<ValidatedApiKey | null> {
    if (!rawToken || !rawToken.startsWith('mos_')) {
      return null;
    }

    const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const key = await this.prisma.apiKey.findFirst({
      where: {
        workspaceId,
        keyHash,
        isActive: true,
      },
    });

    if (!key) {
      return null;
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      return null;
    }

    const scopes: string[] = JSON.parse(key.scopesJson || '[]');

    if (requiredScope && !scopes.includes('*') && !scopes.includes(requiredScope)) {
      return null;
    }

    await this.prisma.apiKey.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id: key.id,
        },
      },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return {
      id: key.id,
      workspaceId: key.workspaceId,
      name: key.name,
      scopes,
    };
  }

  /**
   * Revokes an active API key immediately.
   */
  async revokeApiKey(principal: Principal, keyId: string): Promise<void> {
    requireAnyPermission(principal, ['access.manage', 'workspace.manage', 'audit.read', 'order.release']);

    const key = await this.prisma.apiKey.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: principal.workspaceId,
          id: keyId,
        },
      },
    });

    if (!key) {
      throw new NotFoundError(`API Key ${keyId} not found.`);
    }

    await this.prisma.apiKey.update({
      where: {
        workspaceId_id: {
          workspaceId: principal.workspaceId,
          id: keyId,
        },
      },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Lists all API keys for workspace (masks the secret).
   */
  async listApiKeys(principal: Principal) {
    requireAnyPermission(principal, ['access.manage', 'workspace.manage', 'audit.read', 'order.release']);

    const keys = await this.prisma.apiKey.findMany({
      where: {
        workspaceId: principal.workspaceId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: JSON.parse(k.scopesJson || '[]'),
      isActive: k.isActive,
      expiresAt: k.expiresAt?.toISOString() || null,
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      createdAt: k.createdAt.toISOString(),
    }));
  }
}
