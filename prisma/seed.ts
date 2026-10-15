import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface PermissionEntry {
  code: string;
  roles: string[];
}

interface PermissionMatrix {
  roles: string[];
  permissions: PermissionEntry[];
}

export async function seedPermissionsAndRoles(db: PrismaClient, workspaceId?: string) {
  const matrixPath = path.resolve(
    process.cwd(),
    'docs/superpowers/specs/2026-10-15-manuos-functional-prototype/permission-matrix.json'
  );
  const matrixRaw = fs.readFileSync(matrixPath, 'utf-8');
  const matrix: PermissionMatrix = JSON.parse(matrixRaw);

  // 1. Upsert all catalog permissions
  for (const perm of matrix.permissions) {
    const [resource, action] = perm.code.split('.');
    await db.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: {
        code: perm.code,
        description: `Permission to ${action} ${resource}`,
        resource: resource || 'general',
        action: action || 'access',
      },
    });
  }

  // 2. Ensure default demo workspace exists if workspaceId is not specified
  let targetWorkspaceId = workspaceId;
  if (!targetWorkspaceId) {
    const demoWs = await db.workspace.upsert({
      where: { code: 'DEMO' },
      update: {},
      create: {
        code: 'DEMO',
        name: 'Precision Works',
        timezone: 'Asia/Jakarta',
        currency: 'IDR',
        isDemo: true,
      },
    });
    targetWorkspaceId = demoWs.id;
  }

  // 3. Create or update system roles for the workspace
  const roleMap = new Map<string, string>();
  for (const roleCode of matrix.roles) {
    const role = await db.role.upsert({
      where: {
        workspaceId_code: {
          workspaceId: targetWorkspaceId,
          code: roleCode,
        },
      },
      update: {},
      create: {
        workspaceId: targetWorkspaceId,
        code: roleCode,
        name: roleCode.replace('_', ' '),
        isSystem: true,
        isActive: true,
      },
    });
    roleMap.set(roleCode, role.id);
  }

  // 4. Link role permissions
  for (const perm of matrix.permissions) {
    for (const roleCode of perm.roles) {
      const roleId = roleMap.get(roleCode);
      if (!roleId) continue;

      await db.rolePermission.upsert({
        where: {
          roleId_permissionCode: {
            roleId,
            permissionCode: perm.code,
          },
        },
        update: {},
        create: {
          workspaceId: targetWorkspaceId,
          roleId,
          permissionCode: perm.code,
        },
      });
    }
  }

  return { workspaceId: targetWorkspaceId, rolesCount: matrix.roles.length };
}

async function main() {
  console.log('Seeding permissions and default system roles...');
  const result = await seedPermissionsAndRoles(prisma);
  console.log(`Seeding completed for workspace ${result.workspaceId} (${result.rolesCount} roles).`);
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
