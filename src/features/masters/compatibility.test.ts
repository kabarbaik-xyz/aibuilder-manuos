import {describe,it,expect} from 'vitest';
import {normalizeMasterRecord,masterRequestBody} from './compatibility';
import {createItemSchema,createLocationSchema,createItemConversionSchema} from '@/server/modules/masters/contracts';
describe('master UI contracts',()=>{
 it('renders actual master records without a React object child or absent item type',()=>{
  expect(normalizeMasterRecord({machineClass:{id:'class-1',name:'CNC'},isActive:true})).toMatchObject({machineClass:'CNC',machineClassId:'class-1',status:'ACTIVE'});
  expect(normalizeMasterRecord({itemType:'FINISHED',tracking:'SERIAL',isActive:false})).toMatchObject({type:'FINISHED_GOOD',isSerialTracked:true,isLotTracked:false,status:'INACTIVE'});
 });
 it('does not invent unavailable commercial or cost measurements',()=>{
  const result=normalizeMasterRecord({code:'CUSTOMER',name:'A',isActive:true});
  expect(result.creditTermsDays).toBeUndefined();expect(result.hourlyRateCents).toBeUndefined();
 });
 it('submits item and location fields accepted by the existing server schemas',()=>{
  expect(createItemSchema.parse(masterRequestBody('/api/items',{code:'ITEM',name:'Part',type:'FINISHED_GOOD',baseUomId:'pcs',isSerialTracked:true},'POST'))).toMatchObject({itemType:'FINISHED',tracking:'SERIAL'});
  expect(createLocationSchema.parse(masterRequestBody('/api/locations',{code:'FG',name:'Finished goods',type:'FINISHED_GOODS'},'POST')).kind).toBe('FG');
 });
 it('preserves the exact input-unit to base-unit conversion ratio',()=>{
  const value=masterRequestBody('/api/items/item-id/conversions',{toUomId:'box',factorAtoms:'12500000'},'POST');
  expect(createItemConversionSchema.parse(value)).toEqual({inputUomId:'box',ratioNumerator:25,ratioDenominator:2});
 });
 it('rejects a conflicting tracking configuration rather than silently losing a field',()=>{
  expect(()=>masterRequestBody('/api/items',{isLotTracked:true,isSerialTracked:true},'POST')).toThrow('either lot or serial');
 });
});
