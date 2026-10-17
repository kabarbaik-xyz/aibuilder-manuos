import { PrismaClient } from '@prisma/client';
import { createTestDatabase } from './database';
import { seedTestAccess, TestAccessResult } from './access';
import { MastersService } from '@/server/modules/masters/service';
import { AccessService } from '@/server/modules/access/service';

export interface Clock {
  now(): Date;
  set(date: Date): void;
  advance(ms: number): void;
}

export interface WorkspaceFixture {
  workspaceId: string;
  users: {
    owner: TestAccessResult;
    admin: TestAccessResult;
    planner: TestAccessResult;
    buyer: TestAccessResult;
    operator: TestAccessResult;
    warehouse: TestAccessResult;
    qc: TestAccessResult;
    customerUser: TestAccessResult;
  };
  masters: {
    uomPcsId: string;
    uomKgId: string;
    customerId: string;
    supplierId: string;
    rawItemId: string;
    fgItemId: string;
    rawLocationId: string;
    wipLocationId: string;
    fgLocationId: string;
    quarantineLocationId: string;
    customerLocationId: string;
    scrapLocationId: string;
    departmentId: string;
    calendarId: string;
    machineClassId: string;
    machineId: string;
    technicianId: string;
    skillId: string;
    orderTypeId: string;
    qcChecklistId: string;
  };
}

export interface FactoryFixture {
  db: PrismaClient;
  url: string;
  clock: Clock;
  alpha: WorkspaceFixture;
  beta: {
    workspaceId: string;
    users: {
      owner: TestAccessResult;
    };
    masters: {
      customerId: string;
      rawItemId: string;
      rawLocationId: string;
    };
  };
  close(): Promise<void>;
}

export async function createFactoryFixture(): Promise<FactoryFixture> {
  const testDb = await createTestDatabase();
  (global as any).__manuos_db = testDb.db;
  const mastersService = new MastersService(testDb.db);

  // Clock implementation
  let currentTime = new Date('2026-10-15T08:00:00.000Z');
  const clock: Clock = {
    now: () => new Date(currentTime.getTime()),
    set: (d: Date) => {
      currentTime = new Date(d.getTime());
    },
    advance: (ms: number) => {
      currentTime = new Date(currentTime.getTime() + ms);
    },
  };

  // -----------------------------------------------------------------
  // 1. Workspace Alpha
  // -----------------------------------------------------------------
  const ownerAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    workspaceName: 'Alpha Aerospace Facility',
    email: 'owner@alpha.test',
    name: 'Alpha Owner',
    roles: ['OWNER', 'ENGINEER'],
  });
  const wsAlphaId = ownerAlpha.workspaceId;

  const adminAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    email: 'admin@alpha.test',
    name: 'Alpha Administrator',
    roles: ['ACCESS_ADMIN'],
  });

  const plannerAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    email: 'planner@alpha.test',
    name: 'Alpha Planner',
    roles: ['PLANNER'],
  });

  const buyerAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    email: 'buyer@alpha.test',
    name: 'Alpha Buyer',
    roles: ['BUYER'],
  });

  const warehouseAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    email: 'warehouse@alpha.test',
    name: 'Alpha Warehouse Specialist',
    roles: ['WAREHOUSE'],
  });

  const qcAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    email: 'qc@alpha.test',
    name: 'Alpha QC Inspector',
    roles: ['QC'],
  });

  // Seed baseline Masters for Alpha using mastersService
  const pcsUom = await mastersService.createUom(
    ownerAlpha.principal,
    { code: 'PCS', name: 'Pieces', dimension: 'PIECE', precision: 0 },
    'key-pcs-alpha'
  );
  const kgUom = await mastersService.createUom(
    ownerAlpha.principal,
    { code: 'KG', name: 'Kilograms', dimension: 'WEIGHT', precision: 3 },
    'key-kg-alpha'
  );

  const customerAlpha = await mastersService.createCustomer(
    ownerAlpha.principal,
    { code: 'CUST-ALPHA-01', name: 'Apex Dynamics Corp' },
    'key-cust-alpha'
  );

  const customerUserAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    email: 'customer@apex.test',
    name: 'Apex Portal Rep',
    roles: ['CUSTOMER'],
    customerId: customerAlpha.data.id,
  });

  const supplierAlpha = await mastersService.createSupplier(
    ownerAlpha.principal,
    { code: 'SUP-TITAN-01', name: 'Titan Alloys Ltd', leadTimeDays: 7 },
    'key-sup-alpha'
  );

  const rawItem = await mastersService.createItem(
    ownerAlpha.principal,
    {
      code: 'RAW-AL6061-ROD',
      name: 'Aluminium 6061 Rod 25mm',
      itemType: 'RAW',
      baseUomId: pcsUom.data.id,
      tracking: 'LOT',
    },
    'key-raw-alpha'
  );

  const fgItem = await mastersService.createItem(
    ownerAlpha.principal,
    {
      code: 'FG-BRACKET-X1',
      name: 'Precision Mounting Bracket X1',
      itemType: 'FINISHED',
      baseUomId: pcsUom.data.id,
      // Batch scenarios require lot tracking; serialized-unit scenarios create
      // a dedicated SERIAL item and record each physical unit explicitly.
      tracking: 'LOT',
    },
    'key-fg-alpha'
  );

  const rawLoc = await mastersService.createLocation(
    ownerAlpha.principal,
    { code: 'LOC-RAW-A1', name: 'Raw Warehouse A1', kind: 'RAW' },
    'key-loc-raw-alpha'
  );

  const wipLoc = await mastersService.createLocation(
    ownerAlpha.principal,
    { code: 'LOC-WIP-SHOP', name: 'Shop Floor WIP Stage', kind: 'WIP' },
    'key-loc-wip-alpha'
  );

  const fgLoc = await mastersService.createLocation(
    ownerAlpha.principal,
    { code: 'LOC-FG-BAY1', name: 'Finished Goods Bay 1', kind: 'FG' },
    'key-loc-fg-alpha'
  );

  const quarantineLoc = await mastersService.createLocation(
    ownerAlpha.principal,
    { code: 'LOC-QUAR-01', name: 'Quarantine Holding Bay', kind: 'QUARANTINE' },
    'key-loc-quar-alpha'
  );

  const customerLoc = await mastersService.createLocation(
    ownerAlpha.principal,
    { code: 'LOC-CUST-STAGE', name: 'Customer Staging Outbound', kind: 'CUSTOMER' },
    'key-loc-cust-alpha'
  );

  const scrapLoc = await mastersService.createLocation(
    ownerAlpha.principal,
    { code: 'LOC-SCRAP-01', name: 'Scrap & Consumption Area', kind: 'SCRAP' },
    'key-loc-scrap-alpha'
  );

  const dept = await mastersService.createDepartment(
    ownerAlpha.principal,
    { code: 'DEPT-CNC', name: 'Precision CNC Machining' },
    'key-dept-alpha'
  );

  const cal = await mastersService.createCalendar(
    ownerAlpha.principal,
    { code: 'CAL-DAY', name: 'Standard Day Shift', timezone: 'UTC' },
    'key-cal-alpha'
  );

  const mClass = await mastersService.createMachineClass(
    ownerAlpha.principal,
    { code: 'MILL-5AX', name: '5-Axis CNC Milling Center' },
    'key-mclass-alpha'
  );

  const machine = await mastersService.createMachine(
    ownerAlpha.principal,
    {
      code: 'CNC-01',
      name: 'Haas VF-2SS 5-Axis',
      machineClassId: mClass.data.id,
      departmentId: dept.data.id,
      calendarId: cal.data.id,
    },
    'key-mach-alpha'
  );

  const skill = await mastersService.createSkill(
    ownerAlpha.principal,
    { code: 'SKILL-MILL-5AX', name: '5-Axis Simultaneous Milling', scaleMax: 5 },
    'key-skill-alpha'
  );

  const operatorAlpha = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-ALPHA',
    email: 'operator@alpha.test',
    name: 'Lead CNC Operator',
    roles: ['TECHNICIAN'],
  });

  const tech = await mastersService.createTechnician(
    ownerAlpha.principal,
    {
      code: 'TECH-01',
      name: 'Lead CNC Operator',
      departmentId: dept.data.id,
      calendarId: cal.data.id,
    },
    'key-tech-alpha'
  );
  await new AccessService(testDb.db).updateMembership(
    adminAlpha.principal,
    operatorAlpha.membershipId,
    { roleCodes: ['TECHNICIAN'], status: 'ACTIVE', expectedVersion: 1, technicianId: tech.data.id },
    'key-access-link-operator-alpha'
  );
  operatorAlpha.principal.technicianId = tech.data.id;

  await mastersService.assignSkill(
    ownerAlpha.principal,
    tech.data.id,
    { skillId: skill.data.id, level: 4 },
    'key-tech-skill-alpha'
  );

  const orderType = await mastersService.createOrderType(
    ownerAlpha.principal,
    { code: 'MTO-AERO', name: 'Aerospace Make-To-Order' },
    'key-otype-alpha'
  );

  const qcChecklist = await mastersService.createQcChecklist(
    ownerAlpha.principal,
    {
      code: 'QC-AERO-01',
      name: 'Aerospace Structural Inspection',
      revision: 1,
      checks: [
        {
          code: 'DIM-01',
          description: 'Flange thickness measurement',
          method: 'MEASUREMENT',
          unit: 'mm',
          limitsJson: JSON.stringify({ min: 12.0, max: 12.5 }),
          isRequired: true,
        },
      ],
    },
    'key-qc-alpha'
  );

  // -----------------------------------------------------------------
  // 2. Workspace Beta (Cross-workspace Isolation Fixture)
  // -----------------------------------------------------------------
  const ownerBeta = await seedTestAccess(testDb.db, {
    workspaceCode: 'WS-BETA',
    workspaceName: 'Beta Electronics Facility',
    email: 'owner@beta.test',
    name: 'Beta Owner',
    roles: ['OWNER', 'ENGINEER'],
  });

  const pcsUomBeta = await mastersService.createUom(
    ownerBeta.principal,
    { code: 'PCS', name: 'Pieces', dimension: 'PIECE', precision: 0 },
    'key-pcs-beta'
  );

  const customerBeta = await mastersService.createCustomer(
    ownerBeta.principal,
    { code: 'CUST-BETA-01', name: 'Beta Avionics Corp' },
    'key-cust-beta'
  );

  const rawItemBeta = await mastersService.createItem(
    ownerBeta.principal,
    {
      code: 'RAW-COPPER-WIRE',
      name: 'Copper Wire 0.5mm Spool',
      itemType: 'RAW',
      baseUomId: pcsUomBeta.data.id,
      tracking: 'NONE',
    },
    'key-raw-beta'
  );

  const rawLocationBeta = await mastersService.createLocation(
    ownerBeta.principal,
    { code: 'LOC-RAW-BETA', name: 'Beta Raw Store', kind: 'RAW' },
    'key-loc-raw-beta'
  );

  return {
    db: testDb.db,
    url: testDb.url,
    clock,
    alpha: {
      workspaceId: wsAlphaId,
      users: {
        owner: ownerAlpha,
        admin: adminAlpha,
        planner: plannerAlpha,
        buyer: buyerAlpha,
        operator: operatorAlpha,
        warehouse: warehouseAlpha,
        qc: qcAlpha,
        customerUser: customerUserAlpha,
      },
      masters: {
        uomPcsId: pcsUom.data.id,
        uomKgId: kgUom.data.id,
        customerId: customerAlpha.data.id,
        supplierId: supplierAlpha.data.id,
        rawItemId: rawItem.data.id,
        fgItemId: fgItem.data.id,
        rawLocationId: rawLoc.data.id,
        wipLocationId: wipLoc.data.id,
        fgLocationId: fgLoc.data.id,
        quarantineLocationId: quarantineLoc.data.id,
        customerLocationId: customerLoc.data.id,
        scrapLocationId: scrapLoc.data.id,
        departmentId: dept.data.id,
        calendarId: cal.data.id,
        machineClassId: mClass.data.id,
        machineId: machine.data.id,
        technicianId: tech.data.id,
        skillId: skill.data.id,
        orderTypeId: orderType.data.id,
        qcChecklistId: qcChecklist.data.id,
      },
    },
    beta: {
      workspaceId: ownerBeta.workspaceId,
      users: {
        owner: ownerBeta,
      },
      masters: {
        customerId: customerBeta.data.id,
        rawItemId: rawItemBeta.data.id,
        rawLocationId: rawLocationBeta.data.id,
      },
    },
    close: async () => {
      delete (global as any).__manuos_db;
      await testDb.close();
    },
  };
}
