import {describe,it,expect} from 'vitest';
import {hydrateAtomFields,stringifyQuantities} from './quantities';
import {formatQuantity} from '@/domain/quantity';
describe('quantity JSON boundary',()=>{
 it('renders received and counted quantities without float loss or bigint type errors',()=>{
  const result=hydrateAtomFields({data:{orderedAtoms:'9007199254740993000000',lines:[{receivedAtoms:'1250000',discrepancyAtoms:'-1000000'}],id:'00123',notes:'1000000'}});
  expect(formatQuantity(result.data.lines[0].receivedAtoms as unknown as bigint)).toBe('1.25');
  expect(result.data.orderedAtoms).toBe(9007199254740993000000n);
  expect(result.data.lines[0].discrepancyAtoms).toBe(-1000000n);
  expect(result.data.id).toBe('00123');expect(result.data.notes).toBe('1000000');
 });
 it('posts nested bigint quantities using the server decimal-string contract',()=>{
  expect(JSON.parse(stringifyQuantities({lines:[{atoms:1250000n}],expectedVersion:3}))).toEqual({lines:[{atoms:'1250000'}],expectedVersion:3});
 });
});
