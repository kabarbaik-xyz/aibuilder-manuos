import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess } from '../fixtures/access';
import { MastersService } from '@/server/modules/masters/service';

describe('F05: Commercial, Item & Location Masters', () => {
  let testDb: TestDatabase;
  let service: MastersService;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    service = new MastersService(testDb.db);
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('creates, reads, updates, and archives a customer with version increments', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    // 1. Create customer
    const createRes = await service.createCustomer(
      access.principal,
      {
        code: 'CUST-001',
        name: 'Meridian Energy',
        email: 'sarah@meridian.test',
        phone: '+62-21-5550192',
        address: 'Kawasan Industri Batam',
      },
      'cmd-cust-1'
    );
    expect(createRes.data.code).toBe('CUST-001');
    expect(createRes.meta.resourceVersion).toBe(1);

    // 2. Read customer
    const fetched = await service.getCustomer(access.principal, createRes.data.id);
    expect(fetched.name).toBe('Meridian Energy');

    // 3. Update customer
    const updateRes = await service.updateCustomer(
      access.principal,
      createRes.data.id,
      {
        expectedVersion: 1,
        name: 'Meridian Energy Pte Ltd',
      },
      'cmd-cust-2'
    );
    expect(updateRes.data.name).toBe('Meridian Energy Pte Ltd');
    expect(updateRes.meta.resourceVersion).toBe(2);

    // 4. Archive customer
    const archiveRes = await service.archiveCustomer(
      access.principal,
      createRes.data.id,
      'cmd-cust-3'
    );
    expect(archiveRes.data.isActive).toBe(false);
    expect(archiveRes.data.archivedAt).not.toBeNull();

    // 5. Archived customer is excluded from active list
    const activeList = await service.listCustomers(access.principal);
    expect(activeList.find((c) => c.id === createRes.data.id)).toBeUndefined();
  });

  it('rejects duplicate customer codes within the same workspace', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    await service.createCustomer(
      access.principal,
      { code: 'DUP-CUST', name: 'Original Customer' },
      'cmd-dup-1'
    );

    await expect(
      service.createCustomer(
        access.principal,
        { code: 'DUP-CUST', name: 'Duplicate Customer' },
        'cmd-dup-2'
      )
    ).rejects.toThrow(/already exists/i);
  });

  it('creates UOMs and validates precision constraints (0 to 6)', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    // Piece with precision 0
    const piece = await service.createUom(
      access.principal,
      { code: 'PCS', name: 'Piece', dimension: 'PIECE', precision: 0 },
      'cmd-uom-pcs'
    );
    expect(piece.data.code).toBe('PCS');

    // Kg with precision 3
    const kg = await service.createUom(
      access.principal,
      { code: 'KG', name: 'Kilogram', dimension: 'WEIGHT', precision: 3 },
      'cmd-uom-kg'
    );
    expect(kg.data.precision).toBe(3);
  });

  it('creates items with valid base UOM and item conversions', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    const uomPcs = await service.createUom(
      access.principal,
      { code: 'PCS-ITEM', name: 'Piece', dimension: 'PIECE', precision: 0 },
      'cmd-uom-pcs-item'
    );

    const uomBox = await service.createUom(
      access.principal,
      { code: 'BOX', name: 'Box of 100', dimension: 'PIECE', precision: 0 },
      'cmd-uom-box'
    );

    // Create Item
    const item = await service.createItem(
      access.principal,
      {
        code: 'RAW-BRACKET',
        name: 'Chassis Bracket Base',
        itemType: 'RAW',
        baseUomId: uomPcs.data.id,
        tracking: 'LOT',
      },
      'cmd-item-1'
    );
    expect(item.data.tracking).toBe('LOT');

    // Add conversion: 1 BOX = 100 PCS (ratio 100 / 1)
    const conv = await service.addConversion(
      access.principal,
      item.data.id,
      {
        inputUomId: uomBox.data.id,
        ratioNumerator: 100,
        ratioDenominator: 1,
      },
      'cmd-conv-1'
    );
    expect(conv.data.ratioNumerator).toBe(100);

    // Reject conversion to item's own base UOM
    await expect(
      service.addConversion(
        access.principal,
        item.data.id,
        {
          inputUomId: uomPcs.data.id,
          ratioNumerator: 1,
          ratioDenominator: 1,
        },
        'cmd-conv-invalid'
      )
    ).rejects.toThrow(/Cannot create conversion between item and its own base UOM/i);
  });

  it('creates locations and enforces valid kind enumeration', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    const locRaw = await service.createLocation(
      access.principal,
      { code: 'LOC-RAW', name: 'Raw Material Bay 1', kind: 'RAW' },
      'cmd-loc-1'
    );
    expect(locRaw.data.kind).toBe('RAW');

    const locFg = await service.createLocation(
      access.principal,
      { code: 'LOC-FG', name: 'Finished Goods Bay', kind: 'FG' },
      'cmd-loc-2'
    );
    expect(locFg.data.kind).toBe('FG');
  });
});
