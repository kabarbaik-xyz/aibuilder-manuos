import { describe, expect, it } from 'vitest';
import { getScanOpenPath } from './scan-routing';

describe('getScanOpenPath', () => {
  it('opens a scanned task in the operator workstation', () => {
    expect(
      getScanOpenPath({
        type: 'TASK',
        entityId: 'task/id',
        displayCode: 'MILL-01',
        title: 'Milling',
        status: 'READY',
        taskId: 'task/id',
      })
    ).toBe('/shop-floor/tasks/task%2Fid');
  });

  it('opens an order when an order barcode is scanned', () => {
    expect(
      getScanOpenPath({
        type: 'ORDER',
        entityId: 'order/id',
        displayCode: 'SO-001',
        title: 'Order SO-001',
        status: 'READY',
      }, true)
    ).toBe('/orders/order%2Fid');
    expect(
      getScanOpenPath({
        type: 'ORDER',
        entityId: 'order/id',
        displayCode: 'SO-001',
        title: 'Order SO-001',
        status: 'READY',
      })
    ).toBeNull();
  });

  it('opens a task associated with a scanned job and stays put if none is available', () => {
    const job = {
      type: 'JOB' as const,
      entityId: 'job-1',
      displayCode: 'MO-001',
      title: 'Job MO-001',
      status: 'RELEASED',
    };

    expect(getScanOpenPath({ ...job, taskId: 'task-2' })).toBe('/shop-floor/tasks/task-2');
    expect(getScanOpenPath(job)).toBeNull();
  });
});
