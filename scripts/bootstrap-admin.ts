import { PrismaClient } from '@prisma/client';
import readline from 'readline';
import { seedPermissionsAndRoles } from '../prisma/seed';
import { provisionUser } from '../src/server/auth/provisioning';

const prisma = new PrismaClient();

function getArg(argName: string): string | undefined {
  const index = process.argv.indexOf(argName);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return undefined;
}

function promptSecurePassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Muted prompt to avoid echoing password
    process.stdout.write(promptText);
    const stdin = process.stdin;
    const oldRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    let password = '';
    const onData = (char: Buffer) => {
      const c = char.toString('utf-8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        if (stdin.isTTY) stdin.setRawMode(oldRaw);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\u0008' || c === '\x7f') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else {
        password += c;
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const email = getArg('--email') || 'owner@example.test';
  const workspaceCode = getArg('--workspace') || 'demo';
  let password = getArg('--password');

  console.log(`=== ManuOS Access Administrator Bootstrap ===`);
  console.log(`Target Workspace: ${workspaceCode}`);
  console.log(`Target Email:     ${email}`);

  if (!password) {
    password = await promptSecurePassword('Enter bootstrap admin password: ');
  }

  if (!password || password.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  // 1. Ensure workspace exists
  const workspace = await prisma.workspace.upsert({
    where: { code: workspaceCode.toUpperCase() },
    update: {},
    create: {
      code: workspaceCode.toUpperCase(),
      name: `${workspaceCode.toUpperCase()} Factory`,
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
    },
  });

  // 2. Ensure permissions and roles are seeded
  await seedPermissionsAndRoles(prisma, workspace.id);

  // 3. Provision user with all roles for full administrative and operational capabilities
  const allRoles = [
    'ACCESS_ADMIN',
    'OWNER',
    'ENGINEER',
    'PLANNER',
    'WAREHOUSE',
    'QC',
    'SALES',
    'BUYER',
    'TECHNICIAN',
  ];

  const { user, membership } = await provisionUser(
    {
      name: 'System Administrator',
      email,
      password,
      workspaceId: workspace.id,
      roleCodes: allRoles,
    },
    prisma
  );

  console.log(`\nBootstrap successful!`);
  console.log(`User ID:       ${user.id}`);
  console.log(`Membership ID: ${membership.id}`);
  console.log(`Assigned:      [${allRoles.join(', ')}]`);
}

main()
  .catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
