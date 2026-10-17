import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { movementOptions } from '@/server/modules/inventory/movement-options';
describe('Inventory movement form choices',()=>{
 let fixture:FactoryFixture;
 beforeAll(async()=>{fixture=await createFactoryFixture();});afterAll(async()=>{await fixture.close();});
 it('requires both movement permission and inventory read',async()=>{
  const p=fixture.alpha.users.admin.principal;
  await expect(movementOptions(fixture.db,{...p,permissions:new Set(['inventory.read'])},'transfer')).rejects.toThrow();
  await expect(movementOptions(fixture.db,{...p,permissions:new Set(['inventory.transfer'])},'transfer')).rejects.toThrow();
 });
 it('returns named positive stock only for the authenticated workspace and selected source',async()=>{
  const p={...fixture.alpha.users.admin.principal,permissions:new Set(['inventory.transfer','inventory.read'])};
  const m=fixture.alpha.masters;
  const lot=await fixture.db.lot.create({data:{workspaceId:p.workspaceId,itemId:m.rawItemId,lotNumber:'READABLE-BATCH'}});
  await fixture.db.stockBalance.create({data:{workspaceId:p.workspaceId,itemId:m.rawItemId,locationId:m.rawLocationId,lotId:lot.id,bucketKey:`${m.rawItemId}:${m.rawLocationId}:${lot.id}`,onHandAtoms:1250000n}});
  const result=await movementOptions(fixture.db,p,'transfer',m.rawItemId,m.rawLocationId);
  expect(result.balances.find(b=>b.lotId===lot.id)).toMatchObject({lotNumber:'READABLE-BATCH',onHand:'1.25'});
  const foreign={...fixture.beta.users.owner.principal,permissions:p.permissions};
  expect((await movementOptions(fixture.db,foreign,'transfer',m.rawItemId,m.rawLocationId)).balances).toEqual([]);
 });
});
