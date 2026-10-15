import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { PrismaClient } from '@prisma/client';
import { POST as postCustomer, GET as getCustomers } from '@/app/api/customers/route';
import { POST as postItem, GET as getItems } from '@/app/api/items/route';
import { POST as postLocation } from '@/app/api/locations/route';
import { POST as postMachine } from '@/app/api/resources/machines/route';
import { POST as postOrderType } from '@/app/api/resources/order-types/route';

describe('F07: Master Setup E2E Walkthrough & Restart Persistence', () => {
  let fixture: FactoryFixture;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('allows granted staff to create master entities through HTTP API routes', async () => {
    const ownerHeaders = fixture.alpha.users.owner.headers;

    // 1. Create a Customer via HTTP POST
    const custReq = new NextRequest('http://localhost:3000/api/customers', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        code: 'CUST-BOEING',
        name: 'Boeing Defense Systems',
        email: 'procurement@boeing.test',
        phone: '+1-800-555-0199',
        address: 'Seattle, WA, USA',
      }),
    });
    const custRes = await postCustomer(custReq);
    expect(custRes.status).toBe(201);
    const custJson = await custRes.json();
    expect(custJson.data.code).toBe('CUST-BOEING');
    expect(custJson.data.name).toBe('Boeing Defense Systems');
    expect(custJson.meta.resourceVersion).toBe(1);

    // 2. Create an Item via HTTP POST
    const itemReq = new NextRequest('http://localhost:3000/api/items', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        code: 'WING-RIB-01',
        name: 'Titanium Wing Rib Machined Assembly',
        itemType: 'FINISHED',
        baseUomId: fixture.alpha.masters.uomPcsId,
        tracking: 'SERIAL',
      }),
    });
    const itemRes = await postItem(itemReq);
    expect(itemRes.status).toBe(201);
    const itemJson = await itemRes.json();
    expect(itemJson.data.code).toBe('WING-RIB-01');
    expect(itemJson.data.tracking).toBe('SERIAL');

    // 3. Create a Location via HTTP POST
    const locReq = new NextRequest('http://localhost:3000/api/locations', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        code: 'LOC-CLEANROOM',
        name: 'ISO Class 7 Cleanroom Staging',
        kind: 'WIP',
        warehouseGroup: 'AERO_SHOP',
      }),
    });
    const locRes = await postLocation(locReq);
    expect(locRes.status).toBe(201);

    // 4. Create a Machine via HTTP POST
    const machReq = new NextRequest('http://localhost:3000/api/resources/machines', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        code: 'EDM-01',
        name: 'Sodick Wire EDM Cutter',
        machineClassId: fixture.alpha.masters.machineClassId,
        departmentId: fixture.alpha.masters.departmentId,
        calendarId: fixture.alpha.masters.calendarId,
      }),
    });
    const machRes = await postMachine(machReq);
    expect(machRes.status).toBe(201);

    // 5. Create an Order Type via HTTP POST
    const otReq = new NextRequest('http://localhost:3000/api/resources/order-types', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        code: 'PROTO-EXP',
        name: 'Experimental Rapid Prototype',
      }),
    });
    const otRes = await postOrderType(otReq);
    expect(otRes.status).toBe(201);
  });

  it('strictly rejects unauthorized/denied roles attempting to create master data directly via HTTP', async () => {
    // Customer Portal User has CUSTOMER_VIEWER role, lacking customer.manage and item.manage
    const customerHeaders = fixture.alpha.users.customerUser.headers;

    const deniedCustReq = new NextRequest('http://localhost:3000/api/customers', {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        code: 'FORGED-CUST',
        name: 'Hacker Customer Attempt',
      }),
    });
    const deniedCustRes = await postCustomer(deniedCustReq);
    expect(deniedCustRes.status).toBe(403);
    const deniedCustJson = await deniedCustRes.json();
    expect(deniedCustJson.error.code).toBe('FORBIDDEN');

    const deniedItemReq = new NextRequest('http://localhost:3000/api/items', {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        code: 'FORGED-ITEM',
        name: 'Hacker Item Attempt',
        itemType: 'RAW',
        baseUomId: fixture.alpha.masters.uomPcsId,
      }),
    });
    const deniedItemRes = await postItem(deniedItemReq);
    expect(deniedItemRes.status).toBe(403);
  });

  it('persists all created records across database disconnect and reconnect (server restart simulation)', async () => {
    // Disconnect and reconnect a fresh PrismaClient to the same SQLite database URL
    const freshClient = new PrismaClient({
      datasources: {
        db: { url: fixture.url },
      },
    });
    await freshClient.$connect();

    // Verify customer exists and is intact
    const cust = await freshClient.customer.findFirst({
      where: {
        workspaceId: fixture.alpha.workspaceId,
        code: 'CUST-BOEING',
      },
    });
    expect(cust).not.toBeNull();
    expect(cust?.name).toBe('Boeing Defense Systems');
    expect(cust?.email).toBe('procurement@boeing.test');
    expect(cust?.address).toBe('Seattle, WA, USA');
    expect(cust?.version).toBe(1);

    // Verify item exists and is intact
    const item = await freshClient.item.findFirst({
      where: {
        workspaceId: fixture.alpha.workspaceId,
        code: 'WING-RIB-01',
      },
    });
    expect(item).not.toBeNull();
    expect(item?.itemType).toBe('FINISHED');
    expect(item?.tracking).toBe('SERIAL');

    // Verify audit log has recorded the creations
    const auditLogs = await freshClient.auditEvent.findMany({
      where: {
        workspaceId: fixture.alpha.workspaceId,
      },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(5);

    await freshClient.$disconnect();
  });

  it('enforces multi-tenant workspace isolation on master queries', async () => {
    // Beta user queries items
    const betaHeaders = fixture.beta.users.owner.headers;
    const betaReq = new NextRequest('http://localhost:3000/api/items', {
      headers: betaHeaders,
    });
    const betaRes = await getItems(betaReq);
    expect(betaRes.status).toBe(200);
    const betaJson = await betaRes.json();

    // Beta should only see its own item (RAW-COPPER-WIRE) and NOT Alpha's items
    const codes = betaJson.data.map((i: any) => i.code);
    expect(codes).toContain('RAW-COPPER-WIRE');
    expect(codes).not.toContain('WING-RIB-01');
    expect(codes).not.toContain('RAW-AL6061-ROD');
  });
});
