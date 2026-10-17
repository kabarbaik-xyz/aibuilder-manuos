import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { AccessService } from '@/server/modules/access/service';
import { MastersService } from '@/server/modules/masters/service';
import { getTechnicianProfile, cancelPersonRoster } from '@/server/modules/masters/person-profile';
import { createBetterAuth, resolvePrincipal } from '@/server/auth/auth';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { PlanningService } from '@/server/modules/planning/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { availablePages, getLandingPage } from '@/lib/persona-navigation';
import { getFunctionalNavigation } from '@/lib/master-navigation';

describe('Connected People & Access', () => {
 let fixture: FactoryFixture; let service: AccessService; let masters: MastersService;
 beforeAll(async()=>{fixture=await createFactoryFixture();service=new AccessService(fixture.db);masters=new MastersService(fixture.db);});
 afterAll(async()=>{await fixture.close();});
 const key=()=>randomUUID(); const password='People-test-password-123';
 it('creates a technician login, department and resource as one idempotent command',async()=>{
  const input={name:'New operator',email:'new-operator@people.test',password,roleCodes:['TECHNICIAN'],departmentId:fixture.alpha.masters.departmentId,newTechnician:{code:'PEOPLE-OP',calendarId:fixture.alpha.masters.calendarId}};
  const attempt=key();const created=await service.createUser(fixture.alpha.users.admin.principal,input,attempt);
  expect((await service.createUser(fixture.alpha.users.admin.principal,input,attempt)).meta.replayed).toBe(true);
  const member=await fixture.db.membership.findUniqueOrThrow({where:{id:created.data.membershipId}});
  expect(member.departmentId).toBe(input.departmentId);expect(member.technicianId).toBeTruthy();
  const tech=await fixture.db.technician.findUniqueOrThrow({where:{id:member.technicianId!}});
  expect(tech.membershipId).toBe(member.id);expect(tech.calendarId).toBe(input.newTechnician.calendarId);expect(tech.departmentId).toBe(input.departmentId);
  expect(await fixture.db.technician.count({where:{workspaceId:fixture.alpha.workspaceId,code:'PEOPLE-OP'}})).toBe(1);
  const auth=createBetterAuth(fixture.db);const login=await auth.api.signInEmail({body:{email:input.email,password},asResponse:true});expect(login.status).toBe(200);
  const session=await login.json();const principal=await resolvePrincipal(new Headers({authorization:`Bearer ${session.token}`,'x-workspace-id':fixture.alpha.workspaceId}),undefined,fixture.db);
  expect(principal.technicianId).toBe(tech.id);expect(getLandingPage([...principal.permissions],principal.roles,principal.customerId)).toBe('/shop-floor');
  const pages=availablePages([...principal.permissions],principal.roles).map(p=>p.href);expect(pages).toContain('/shop-floor');expect(pages).not.toContain('/settings/users');expect(pages).not.toContain('/planning');
 });
 it('rolls back duplicate profile and rejects cross-workspace departments and invalid starting pages',async()=>{
  const base={name:'Blocked',email:'blocked@people.test',password,roleCodes:['TECHNICIAN'],newTechnician:{code:'PEOPLE-OP'}};
  await expect(service.createUser(fixture.alpha.users.admin.principal,base,key())).rejects.toThrow(/code already exists/);
  expect(await fixture.db.user.findUnique({where:{email:base.email}})).toBeNull();
  const foreign=await fixture.db.department.create({data:{workspaceId:fixture.beta.workspaceId,code:'FOREIGN',name:'Foreign'}});
  await expect(service.createUser(fixture.alpha.users.admin.principal,{...base,newTechnician:{code:'NO-CREATE'},departmentId:foreign.id},key())).rejects.toThrow(/department/);
  await expect(service.createUser(fixture.alpha.users.admin.principal,{...base,newTechnician:{code:'NO-CREATE'},landingPage:'/settings/users'},key())).rejects.toThrow(/Starting page/);
  expect(await fixture.db.technician.count({where:{code:'NO-CREATE'}})).toBe(0);
 });
 it('logs Sales, PPIC and QC in through the same auth with distinct authorized landing pages',async()=>{
  const auth=createBetterAuth(fixture.db);
  for(const [role,home] of [['SALES','/orders'],['PLANNER','/planning'],['QC','/quality/inspections']]){
   const email=`${role.toLowerCase()}@people.test`;const created=await service.createUser(fixture.alpha.users.admin.principal,{name:role,email,password,roleCodes:[role],departmentId:fixture.alpha.masters.departmentId},key());
   const login=await auth.api.signInEmail({body:{email,password},asResponse:true});expect(login.status).toBe(200);const session=await login.json();
   const principal=await resolvePrincipal(new Headers({authorization:`Bearer ${session.token}`,'x-workspace-id':fixture.alpha.workspaceId}),undefined,fixture.db);
   expect(principal.departmentId).toBe(fixture.alpha.masters.departmentId);expect(principal.technicianId).toBeNull();
   expect(getLandingPage([...principal.permissions],principal.roles,principal.customerId,principal.landingPage)).toBe(home);
   expect(getFunctionalNavigation([...principal.permissions],principal.roles).flatMap(g=>g.items).some(p=>p.href==='/settings/users')).toBe(false);
   expect((await service.listUsers(fixture.alpha.users.admin.principal,created.data.membershipId))[0].departmentId).toBe(fixture.alpha.masters.departmentId);
  }
 });
 it('supports a multi-role preferred home and stops using it when the grant is removed',async()=>{
  const created=await service.createUser(fixture.alpha.users.admin.principal,{name:'Multi role',email:'multi@people.test',password,roleCodes:['SALES','QC'],landingPage:'/quality/inspections'},key());
  const row=(await service.listUsers(fixture.alpha.users.admin.principal,created.data.membershipId))[0];
  expect(row.landingPage).toBe('/quality/inspections');
  await service.updateMembership(fixture.alpha.users.admin.principal,row.id,{roleCodes:['SALES'],status:'ACTIVE',expectedVersion:row.version,landingPage:null},key());
  const roles=(await service.listRoles(fixture.alpha.users.admin.principal)).filter(r=>r.code==='SALES');
  expect(getLandingPage(roles.flatMap(r=>r.permissions),['SALES'],null,'/quality/inspections')).toBe('/orders');
 });
 it('shows real calendar, roster and assignment evidence separately with workspace/facility guards',async()=>{
  const start=new Date('2026-10-20T00:00:00Z');const end=new Date('2026-10-22T00:00:00Z');
  const input={intervals:[{technicianId:fixture.alpha.masters.technicianId,intervalType:'SHIFT' as const,startAt:'2026-10-20T08:00:00Z',endAt:'2026-10-20T16:00:00Z'}]};
  await masters.publishRosterIntervals(fixture.alpha.users.planner.principal,input,key());
  const data=await getTechnicianProfile(fixture.db,fixture.alpha.users.planner.principal,fixture.alpha.masters.technicianId,start,end);
  expect(data.technician.calendar?.id).toBe(fixture.alpha.masters.calendarId);expect(data.roster).toHaveLength(1);expect(data.bookings).toEqual([]);expect(data.tasks).toEqual([]);
  await expect(getTechnicianProfile(fixture.db,fixture.beta.users.owner.principal,fixture.alpha.masters.technicianId,start,end)).rejects.toThrow(/not found/);
  await expect(getTechnicianProfile(fixture.db,fixture.alpha.users.operator.principal,fixture.alpha.masters.technicianId,start,end)).rejects.toThrow(/Permission/);
  await expect(masters.publishRosterIntervals(fixture.alpha.users.planner.principal,{intervals:[{...input.intervals[0],startAt:'invalid'}]},key())).rejects.toThrow(/Invalid interval/);
  const tech=await fixture.db.technician.findFirstOrThrow({where:{code:'PEOPLE-OP'}});
  await expect(getTechnicianProfile(fixture.db,{...fixture.alpha.users.admin.principal,facilityIds:[]},tech.id,start,end)).rejects.toThrow(/facilities/);
 });
 it('hides archived certification definitions and rejects new assignments to them',async()=>{
  const created=await masters.createCertification(fixture.alpha.users.owner.principal,{code:`ARCH-${key().slice(0,8)}`,name:'Archived qualification'},key());
  await masters.archiveCatalogRecord(fixture.alpha.users.owner.principal,'certifications',created.data.id,key());
  expect(await masters.listCertifications(fixture.alpha.users.owner.principal)).not.toContainEqual(expect.objectContaining({id:created.data.id}));
  await expect(masters.assignCert(fixture.alpha.users.owner.principal,fixture.alpha.masters.technicianId,{certificationId:created.data.id,issuedDate:'2026-10-01',validUntil:'2027-10-01'},key())).rejects.toThrow(/not found/i);
 });
 it('connects a real released job assignment to the person view and protects booked availability',async()=>{
  const owner=fixture.alpha.users.owner.principal;const planner=fixture.alpha.users.planner.principal;const m=fixture.alpha.masters;
  const workflow=new WorkflowService(fixture.db);const orders=new OrderService(fixture.db);const engineering=new EngineeringService(fixture.db);const planning=new PlanningService(fixture.db);
  const template=await workflow.createTemplate(owner,{orderTypeId:m.orderTypeId,code:'PEOPLE-WF',name:'People assignment test'},key());
  const version=await workflow.saveVersionDraft(owner,template.data.initialVersionId,{definition:{schemaVersion:1,name:'People routing',nodes:[{key:'OP-CUT',name:'Cut component',type:'OPERATION',plannedDurationMinutes:60}],edges:[]}},key());
  await workflow.submitReview(owner,version.data.id,key());await workflow.publishVersion(owner,version.data.id,key());
  const order=await orders.createOrderDraft(owner,{customerId:m.customerId,orderTypeId:m.orderTypeId,itemId:m.fgItemId,orderedQuantity:1,requestedDate:'2026-11-20T00:00:00Z'},key());
  const revision=order.data.engineeringRevisions[0];await engineering.saveEngineeringDraft(owner,revision.id,{workflowVersionId:version.data.id,bomLines:[]},key());await engineering.approveEngineeringRevision(owner,revision.id,key());
  const released=await releaseOrder(owner,order.data.id,key(),fixture.db);
  const task=await fixture.db.task.findFirstOrThrow({where:{instanceId:released.data.instanceId}});
  const startAt='2026-11-02T08:00:00Z';const endAt='2026-11-02T09:00:00Z';
  const roster=await masters.publishRosterIntervals(planner,{intervals:[{technicianId:m.technicianId,startAt,endAt,intervalType:'SHIFT'}]},key());
  await planning.assignTask(planner,{taskId:task.id,expectedVersion:task.version,technicianId:m.technicianId,startAt,endAt},key());
  const profile=await getTechnicianProfile(fixture.db,planner,m.technicianId,new Date('2026-11-02T00:00:00Z'),new Date('2026-11-03T00:00:00Z'));
  expect(profile.bookings.map(b=>b.taskId)).toContain(task.id);expect(profile.tasks.find(t=>t.id===task.id)?.operation).toBe('Cut component');
  await expect(cancelPersonRoster(fixture.db,planner,roster.data[0].id,1,key())).rejects.toThrow(/confirmed work bookings/);
  expect((await fixture.db.rosterInterval.findUniqueOrThrow({where:{id:roster.data[0].id}})).status).toBe('PUBLISHED');
  const leave=await masters.publishRosterIntervals(planner,{intervals:[{technicianId:m.technicianId,startAt:'2026-11-04T08:00:00Z',endAt:'2026-11-04T16:00:00Z',intervalType:'LEAVE'}]},key());
  const attempt=key();await cancelPersonRoster(fixture.db,planner,leave.data[0].id,1,attempt);expect((await cancelPersonRoster(fixture.db,planner,leave.data[0].id,1,attempt)).meta.replayed).toBe(true);
 });

});
