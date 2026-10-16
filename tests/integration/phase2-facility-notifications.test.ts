import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { MastersService } from '@/server/modules/masters/service';
import { NotificationService } from '@/server/modules/notifications/service';
import { getNotificationHref } from '@/features/notifications/notification-links';
import { ConflictError, NotFoundError, ForbiddenError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';

describe('Phase 2: Facility Scope, Reference Data, Notifications & Audit Correlation', () => {
  let fixture: FactoryFixture;
  let mastersService: MastersService;
  let notificationService: NotificationService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    mastersService = new MastersService(fixture.db);
    notificationService = new NotificationService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  describe('1. Facility Management & Workspace Multi-Site Scoping', () => {
    let facSite1Id: string;
    let facSite2Id: string;

    it('creates multiple facilities under the same workspace with unique codes', async () => {
      const { alpha } = fixture;

      const res1 = await mastersService.createFacility(
        alpha.users.owner.principal,
        {
          code: 'FAC-WEST',
          name: 'West Coast Fabrication Plant',
          timezone: 'Asia/Jakarta',
          address: 'Jl. Industri Barat No. 10',
          isDefault: true,
        },
        'cmd-fac-west'
      );
      expect(res1.data.code).toBe('FAC-WEST');
      expect(res1.data.isDefault).toBe(true);
      facSite1Id = res1.data.id;

      const res2 = await mastersService.createFacility(
        alpha.users.owner.principal,
        {
          code: 'FAC-EAST',
          name: 'East Coast Assembly Center',
          timezone: 'Asia/Makassar',
          address: 'Kawasan Industri Timur Blok B',
          isDefault: false,
        },
        'cmd-fac-east'
      );
      expect(res2.data.code).toBe('FAC-EAST');
      expect(res2.data.isDefault).toBe(false);
      facSite2Id = res2.data.id;

      // Duplicate code in same workspace rejected
      await expect(
        mastersService.createFacility(
          alpha.users.owner.principal,
          {
            code: 'FAC-WEST',
            name: 'Duplicate Code',
          },
          'cmd-fac-dup'
        )
      ).rejects.toThrow(ConflictError);
    });

    it('lists facilities ordered by default first and code ascending', async () => {
      const { alpha } = fixture;
      const list = await mastersService.listFacilities(alpha.users.owner.principal);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0].isDefault).toBe(true);
      expect(list[0].code).toBe('FAC-WEST');
    });

    it('switching default facility unsets prior default facility in the workspace', async () => {
      const { alpha } = fixture;

      await mastersService.updateFacility(
        alpha.users.owner.principal,
        facSite2Id,
        { isDefault: true },
        'cmd-fac-switch-def'
      );

      const list = await mastersService.listFacilities(alpha.users.owner.principal);
      const facEast = list.find((f) => f.id === facSite2Id);
      const facWest = list.find((f) => f.id === facSite1Id);

      expect(facEast?.isDefault).toBe(true);
      expect(facWest?.isDefault).toBe(false);
    });

    it('rejects unauthorized users from creating or updating facilities', async () => {
      const { alpha } = fixture;
      await expect(
        mastersService.createFacility(
          alpha.users.operator.principal,
          { code: 'FAC-FORBIDDEN', name: 'Unauthorized' },
          'cmd-fac-unauth'
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('2. Facility Membership Grants & Scoping', () => {
    let facEastId: string;
    let operatorMembershipId: string;

    beforeAll(async () => {
      const { alpha } = fixture;
      const list = await mastersService.listFacilities(alpha.users.owner.principal);
      const facEast = list.find((f) => f.code === 'FAC-EAST');
      facEastId = facEast!.id;
      operatorMembershipId = alpha.users.operator.membershipId;
    });

    it('grants facility access to a membership', async () => {
      const { alpha } = fixture;
      const res = await mastersService.grantFacilityAccess(
        alpha.users.admin.principal,
        operatorMembershipId,
        facEastId,
        'cmd-grant-east'
      );
      expect(res.data.membershipId).toBe(operatorMembershipId);
      expect(res.data.facilityId).toBe(facEastId);

      const grantInDb = await fixture.db.membershipFacilityGrant.findUnique({
        where: {
          membershipId_facilityId: {
            membershipId: operatorMembershipId,
            facilityId: facEastId,
          },
        },
      });
      expect(grantInDb).toBeTruthy();
    });

    it('revokes facility access from a membership', async () => {
      const { alpha } = fixture;
      const res = await mastersService.revokeFacilityAccess(
        alpha.users.admin.principal,
        operatorMembershipId,
        facEastId,
        'cmd-revoke-east'
      );
      expect(res.data.revoked).toBe(true);

      const grantInDb = await fixture.db.membershipFacilityGrant.findUnique({
        where: {
          membershipId_facilityId: {
            membershipId: operatorMembershipId,
            facilityId: facEastId,
          },
        },
      });
      expect(grantInDb).toBeNull();
    });
  });

  describe('3. Notification Inbox & Read States', () => {
    let notificationId1: string;
    let notificationId2: string;

    it('dispatches notifications and maintains unread count per user', async () => {
      const { alpha } = fixture;

      const n1 = await notificationService.sendNotification(alpha.workspaceId, {
        userId: alpha.users.operator.userId,
        title: 'New Task Assignment',
        body: 'You have been assigned to Operation OP-10 on Bracket X1.',
        subjectType: 'TASK',
        subjectId: 'task-12345',
        metadata: { priority: 'HIGH' },
      });
      notificationId1 = n1.id;

      const n2 = await notificationService.sendNotification(alpha.workspaceId, {
        userId: alpha.users.operator.userId,
        title: 'QC Approval Received',
        body: 'Batch LOT-001 has passed final inspection.',
        subjectType: 'INSPECTION',
        subjectId: 'insp-67890',
      });
      notificationId2 = n2.id;

      const unreadCount = await notificationService.getUnreadCount(alpha.users.operator.principal);
      expect(unreadCount).toBeGreaterThanOrEqual(2);

      const list = await notificationService.listNotifications(alpha.users.operator.principal, { unreadOnly: true });
      expect(list.some((n) => n.id === notificationId1)).toBe(true);
      expect(list.some((n) => n.id === notificationId2)).toBe(true);
    });

    it('marks a single notification as read', async () => {
      const { alpha } = fixture;
      const updated = await notificationService.markAsRead(alpha.users.operator.principal, notificationId1);
      expect(updated.status).toBe('READ');
      expect(updated.readAt).toBeTruthy();

      const unreadList = await notificationService.listNotifications(alpha.users.operator.principal, { unreadOnly: true });
      expect(unreadList.some((n) => n.id === notificationId1)).toBe(false);
      expect(unreadList.some((n) => n.id === notificationId2)).toBe(true);
    });

    it('marks all notifications as read for caller', async () => {
      const { alpha } = fixture;
      await notificationService.markAllAsRead(alpha.users.operator.principal);

      const unreadCount = await notificationService.getUnreadCount(alpha.users.operator.principal);
      expect(unreadCount).toBe(0);
    });

    it('isolates notification access between different users', async () => {
      const { alpha } = fixture;
      // Planner user should not see operator notifications
      const plannerNotifications = await notificationService.listNotifications(alpha.users.planner.principal);
      expect(plannerNotifications.some((n) => n.id === notificationId1)).toBe(false);
      expect(plannerNotifications.some((n) => n.id === notificationId2)).toBe(false);
    });

    it('persists scoped preferences, enforces stale versions and replays without duplicate changes', async () => {
      const principal = fixture.alpha.users.operator.principal;
      const current = await notificationService.getPreferences(principal);
      const preferences = { ...current.preferences, ASSIGNMENT: false };
      const input = { preferences, expectedVersion: current.version };
      const result = await notificationService.updatePreferences(principal, input, 'notification-prefs-update');
      const replay = await notificationService.updatePreferences(principal, input, 'notification-prefs-update');
      expect(replay.meta.replayed).toBe(true);
      expect(replay.data).toEqual(result.data);
      await expect(notificationService.updatePreferences(principal, input, 'notification-prefs-stale')).rejects.toThrow(ConflictError);
      expect((await notificationService.getPreferences(fixture.alpha.users.planner.principal)).preferences.ASSIGNMENT).toBe(true);
      const forgedMembership = { ...principal, membershipId: fixture.beta.users.owner.principal.membershipId };
      await expect(notificationService.getPreferences(forgedMembership)).rejects.toThrow(NotFoundError);
    });

    it('records muted delivery exactly once without increasing unread counts and rolls back with its command', async () => {
      const { alpha, beta } = fixture;
      const principal = alpha.users.operator.principal;
      const unreadBefore = await notificationService.getUnreadCount(principal);
      const input = { userId: principal.userId, category: 'ASSIGNMENT' as const, title: 'Muted assignment', dedupeKey: 'muted-assignment' };
      const first = await notificationService.sendNotification(alpha.workspaceId, input);
      const second = await notificationService.sendNotification(alpha.workspaceId, input);
      expect(first.id).toBe(second.id);
      expect(first.deliveryStatus).toBe('SUPPRESSED');
      expect(first.deliveryReason).toBe('PREFERENCE_DISABLED');
      expect(await notificationService.getUnreadCount(principal)).toBe(unreadBefore);
      expect((await notificationService.listNotifications(principal)).some((item) => item.id === first.id)).toBe(false);
      expect((await notificationService.getDeliverySummary(principal)).suppressed).toBe(1);
      await expect(notificationService.sendNotification(alpha.workspaceId, { ...input, facilityId: beta.users.owner.principal.facilityId! })).rejects.toThrow(NotFoundError);
      await expect(executeCommand({
        principal, commandType: 'test.notification.rollback', idempotencyKey: 'notification-rollback', payload: {}, prismaClient: fixture.db,
        handler: async (tx) => {
          await new NotificationService(tx).sendNotification(alpha.workspaceId, { ...input, dedupeKey: 'rolled-back-notification' });
          throw new Error('Rollback');
        },
      })).rejects.toThrow('Rollback');
      expect(await fixture.db.notificationInbox.count({ where: { dedupeKey: 'rolled-back-notification' } })).toBe(0);
    });
  });

  describe('4. Configurable Issue & Blocker Reasons Catalog', () => {
    let pauseReasonId: string;

    it('creates and categorizes configurable issue reasons with unique codes per category', async () => {
      const { alpha } = fixture;

      const r1 = await mastersService.createIssueReason(
        alpha.users.planner.principal,
        {
          category: 'PAUSE',
          code: 'TOOL_BREAK',
          label: 'Tool Breakage / Replacement',
          sortOrder: 1,
        },
        'cmd-reason-tool'
      );
      expect(r1.data.code).toBe('TOOL_BREAK');
      expect(r1.data.category).toBe('PAUSE');
      pauseReasonId = r1.data.id;

      const r2 = await mastersService.createIssueReason(
        alpha.users.planner.principal,
        {
          category: 'BLOCKER',
          code: 'MAT_SHORT',
          label: 'Material Shortage at Workstation',
          sortOrder: 2,
        },
        'cmd-reason-mat'
      );
      expect(r2.data.category).toBe('BLOCKER');

      // Duplicate code in same category rejected
      await expect(
        mastersService.createIssueReason(
          alpha.users.planner.principal,
          {
            category: 'PAUSE',
            code: 'TOOL_BREAK',
            label: 'Duplicate Tool Break',
          },
          'cmd-reason-dup'
        )
      ).rejects.toThrow(ConflictError);
    });

    it('lists issue reasons filtered by category', async () => {
      const { alpha } = fixture;
      const pauseReasons = await mastersService.listIssueReasons(alpha.users.operator.principal, 'PAUSE');
      expect(pauseReasons.every((r) => r.category === 'PAUSE')).toBe(true);
      expect(pauseReasons.some((r) => r.code === 'TOOL_BREAK')).toBe(true);

      const blockerReasons = await mastersService.listIssueReasons(alpha.users.operator.principal, 'BLOCKER');
      expect(blockerReasons.every((r) => r.category === 'BLOCKER')).toBe(true);
      expect(blockerReasons.some((r) => r.code === 'MAT_SHORT')).toBe(true);
    });

    it('updates issue reason label and active status', async () => {
      const { alpha } = fixture;
      const updated = await mastersService.updateIssueReason(
        alpha.users.planner.principal,
        pauseReasonId,
        {
          label: 'Severe Tool Failure',
          isActive: true,
          sortOrder: 10,
        },
        'cmd-reason-upd'
      );
      expect(updated.data.label).toBe('Severe Tool Failure');
      expect(updated.data.sortOrder).toBe(10);
    });
  });

  describe('5. Durable Correlation & Audit Reason Propagation', () => {
    it('persists reason and correlationId in audit trail via executeCommand', async () => {
      const { alpha } = fixture;
      const corrId = 'corr-req-889900';
      const cmdReason = 'Routine maintenance site schedule update';

      await executeCommand({
        principal: alpha.users.owner.principal,
        commandType: 'test.audit.correlated',
        idempotencyKey: 'cmd-audit-corr-test',
        correlationId: corrId,
        reason: cmdReason,
        payload: { test: true },
        prismaClient: fixture.db,
        handler: async (tx) => {
          return {
            data: { executed: true },
            aggregateType: 'TEST_AGGREGATE',
            aggregateId: 'test-123',
            resourceVersion: 1,
          };
        },
      });

      const audit = await fixture.db.auditEvent.findFirst({
        where: {
          workspaceId: alpha.workspaceId,
          commandId: 'cmd-audit-corr-test',
        },
      });

      expect(audit).toBeTruthy();
      expect(audit?.correlationId).toBe(corrId);
      expect(audit?.reason).toBe(cmdReason);
    });
  });

  describe('6. Operational Resource Facility Scoping & Cross-Tenant Boundary', () => {
    let facWestId: string;

    beforeAll(async () => {
      const list = await mastersService.listFacilities(fixture.alpha.users.owner.principal);
      const facWest = list.find((f) => f.code === 'FAC-WEST');
      facWestId = facWest!.id;
    });

    it('creates a machine and technician with valid facilityId', async () => {
      const { alpha } = fixture;

      const machineRes = await mastersService.createMachine(
        alpha.users.planner.principal,
        {
          code: 'CNC-WEST-01',
          name: 'West Site CNC Milling Station',
          machineClassId: alpha.masters.machineClassId,
          facilityId: facWestId,
        },
        'cmd-create-machine-west'
      );
      expect(machineRes.data.facilityId).toBe(facWestId);

      const techRes = await mastersService.createTechnician(
        alpha.users.planner.principal,
        {
          code: 'TECH-WEST-01',
          name: 'West Site Lead Machinist',
          facilityId: facWestId,
          maxWeeklyMinutes: 2400,
        },
        'cmd-create-tech-west'
      );
      expect(techRes.data.facilityId).toBe(facWestId);
    });

    it('rejects creating machine or technician with cross-workspace or invalid facilityId', async () => {
      const { alpha, beta } = fixture;
      const betaFac = await fixture.db.facility.findFirst({
        where: { workspaceId: beta.workspaceId },
      });
      expect(betaFac).toBeTruthy();

      // Attempt creating machine in alpha with beta's facility
      await expect(
        mastersService.createMachine(
          alpha.users.planner.principal,
          {
            code: 'CNC-ILLEGAL-FAC',
            name: 'Cross-Tenant Machine',
            machineClassId: alpha.masters.machineClassId,
            facilityId: betaFac!.id,
          },
          'cmd-create-machine-illegal'
        )
      ).rejects.toThrow(NotFoundError);

      // Attempt creating technician in alpha with beta's facility
      await expect(
        mastersService.createTechnician(
          alpha.users.planner.principal,
          {
            code: 'TECH-ILLEGAL-FAC',
            name: 'Cross-Tenant Technician',
            facilityId: betaFac!.id,
          },
          'cmd-create-tech-illegal'
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('updates machine and technician facilityId and rejects invalid foreign facility', async () => {
      const { alpha, beta } = fixture;
      const betaFac = await fixture.db.facility.findFirst({
        where: { workspaceId: beta.workspaceId },
      });

      // Update machine
      await mastersService.updateCatalogRecord(
        alpha.users.planner.principal,
        'machines',
        alpha.masters.machineId,
        { facilityId: facWestId },
        'cmd-upd-mach-fac'
      );

      const mach = await fixture.db.machine.findUnique({ where: { id: alpha.masters.machineId } });
      expect(mach?.facilityId).toBe(facWestId);

      // Reject foreign facility update
      await expect(
        mastersService.updateCatalogRecord(
          alpha.users.planner.principal,
          'machines',
          alpha.masters.machineId,
          { facilityId: betaFac!.id },
          'cmd-upd-mach-fac-illegal'
        )
      ).rejects.toThrow(NotFoundError);

      // Update technician
      await mastersService.updateCatalogRecord(
        alpha.users.planner.principal,
        'technicians',
        alpha.masters.technicianId,
        { facilityId: facWestId },
        'cmd-upd-tech-fac'
      );

      const tech = await fixture.db.technician.findUnique({ where: { id: alpha.masters.technicianId } });
      expect(tech?.facilityId).toBe(facWestId);

      // Reject foreign facility update
      await expect(
        mastersService.updateCatalogRecord(
          alpha.users.planner.principal,
          'technicians',
          alpha.masters.technicianId,
          { facilityId: betaFac!.id },
          'cmd-upd-tech-fac-illegal'
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('7. Multicast Facility Notifications, Entity Deep Links & Locale Formatting', () => {
    it('multicasts notifications to members with matching facility and permission', async () => {
      const { alpha } = fixture;
      const list = await mastersService.listFacilities(alpha.users.owner.principal);
      const facEast = list.find((f) => f.code === 'FAC-EAST')!;

      // Planner has planning.read, ensure planner has grant to FAC-EAST
      await mastersService.grantFacilityAccess(
        alpha.users.admin.principal,
        alpha.users.planner.membershipId,
        facEast.id,
        'cmd-grant-planner-east'
      );

      const initialCount = await notificationService.getUnreadCount(alpha.users.planner.principal);

      await notificationService.notifyFacilityMembers(alpha.workspaceId, facEast.id, 'planning.read', {
        title: 'New Production Release at East Site',
        body: 'Order ORD-EAST-01 has been released for scheduling.',
        category: 'RELEASE',
        subjectType: 'ORDER',
        subjectId: 'ord-east-001',
      });

      const newCount = await notificationService.getUnreadCount(alpha.users.planner.principal);
      expect(newCount).toBe(initialCount + 1);

      const unread = await notificationService.listNotifications(alpha.users.planner.principal, { unreadOnly: true });
      const found = unread.find((n) => n.subjectId === 'ord-east-001');
      expect(found).toBeTruthy();
      expect(found?.title).toBe('New Production Release at East Site');
      expect(found?.category).toBe('RELEASE');
    });

    it('resolves entity deep links correctly for orders, tasks, inspections and task issues', () => {
      expect(getNotificationHref({ subjectType: 'ORDER', subjectId: 'ord-101' })).toBe('/orders/ord-101');
      expect(getNotificationHref({ subjectType: 'TASK', subjectId: 'task-202' })).toBe('/shop-floor/tasks/task-202');
      expect(getNotificationHref({ subjectType: 'INSPECTION', subjectId: 'insp-303' })).toBe('/quality/inspections/insp-303');
      expect(getNotificationHref({
        subjectType: 'TASK_ISSUE',
        subjectId: 'issue-404',
        metadataJson: JSON.stringify({ taskId: 'task-505' }),
      })).toBe('/shop-floor/tasks/task-505');
      expect(getNotificationHref({ subjectType: 'UNKNOWN', subjectId: '123' })).toBeNull();
    });

    it('formats dates in Indonesian locale by default with facility-aware timezone', () => {
      const sampleDate = new Date('2026-10-16T08:30:00.000Z');
      const formatted = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      }).format(sampleDate);

      // In id-ID locale, October is 'Okt' or 'Oktober', and time for 08:30 UTC is 15.30 WIB (UTC+7)
      expect(formatted).toContain('Okt');
      expect(formatted).toContain('15');
    });
  });
});
