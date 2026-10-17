import Link from 'next/link';
import { Panel } from '@/components/ui/panel';
import { Icon } from '@/components/icons';
import { buildDashboardChartData } from './dashboard-chart-data';
import type { DashboardOrderRowDTO } from '@/server/modules/intelligence/dashboard';

interface DashboardChartsProps {
  orders: DashboardOrderRowDTO[];
}

const stages = [
  { label: 'Intake & review', statuses: ['DRAFT', 'REVIEW'], icon: 'order' as const, color: 'var(--muted)' },
  { label: 'Ready & released', statuses: ['READY', 'RELEASED'], icon: 'engineering' as const, color: '#8099d1' },
  { label: 'In production', statuses: ['IN_PRODUCTION'], icon: 'machine' as const, color: 'var(--primary)' },
  { label: 'Partially delivered', statuses: ['PARTIALLY_DELIVERED'], icon: 'truck' as const, color: '#6a9a93' },
  { label: 'Delivered', statuses: ['DELIVERED', 'COMPLETED'], icon: 'check' as const, color: 'var(--success)' },
];

export function DashboardCharts({ orders }: DashboardChartsProps) {
  const activeOrders = orders.filter((order) => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status));
  const priorityOrders = [...activeOrders].sort((a, b) => {
    const left = a.promisedDate ? Date.parse(a.promisedDate) : Infinity;
    const right = b.promisedDate ? Date.parse(b.promisedDate) : Infinity;
    return left - right;
  });
  const chartData = buildDashboardChartData(priorityOrders, []);
  const pipeline = stages.map((stage) => ({ ...stage, count: orders.filter((order) => stage.statuses.includes(order.status)).length }));
  const displayedCount = pipeline.reduce((total, stage) => total + stage.count, 0);
  const otherCount = orders.length - displayedCount;

  return (
    <div className="cc-production-column">
      <Panel className="cc-pipeline-panel">
        <div className="cc-section-head"><div><h2>Order flow</h2><p>Current status across the loaded order snapshot</p></div><Link href="/orders" className="cc-link">All orders<Icon name="arrow" /></Link></div>
        <div className="cc-pipeline-strip" role="img" aria-label={pipeline.map((stage) => `${stage.label}: ${stage.count}`).join(', ')}>
          {pipeline.map((stage) => stage.count > 0 ? <span key={stage.label} style={{ flexGrow: stage.count, backgroundColor: stage.color }} title={`${stage.label}: ${stage.count}`} /> : null)}
          {otherCount > 0 && <span style={{ flexGrow: otherCount, backgroundColor: 'var(--line)' }} title={`Other / cancelled: ${otherCount}`} />}
        </div>
        <div className="cc-pipeline-stages">{pipeline.map((stage) => <div key={stage.label} className={stage.label === 'In production' ? 'is-production' : ''}>
          <div className="cc-stage-label"><i style={{ backgroundColor: stage.color }} />{stage.label}</div><strong>{stage.count}</strong>
        </div>)}</div>
        {otherCount > 0 && <p className="cc-chart-footnote">{otherCount} other / cancelled orders in this snapshot.</p>}
      </Panel>

      <Panel className="cc-production-panel">
        <div className="cc-section-head"><div><h2>Production commitments</h2><p>Nearest promised dates · QC-passed quantity against ordered quantity</p></div><span className="cc-chart-key"><i />QC-passed quantity</span></div>
        {chartData.orderProgress.length === 0 ? <div className="cc-empty"><Icon name="work" /><p>No active orders to chart in this snapshot.</p></div> : <>
          <div className="cc-column-chart" role="group" aria-label="Production progress for up to five active orders with the nearest promised dates">
            <div className="cc-chart-yaxis" aria-hidden="true">{[100, 75, 50, 25, 0].map((value) => <span key={value}>{value}%</span>)}</div>
            <div className="cc-chart-plot">
              <div className="cc-gridlines" aria-hidden="true">{[0, 1, 2, 3, 4].map((line) => <i key={line} />)}</div>
              <div className="cc-chart-columns">{chartData.orderProgress.map((order) => <Link key={order.id} href={`/orders/${order.id}`} className="cc-chart-column" aria-label={`${order.orderNumber}: ${order.progressPct}% complete, ${order.completedQty} of ${order.orderedQty}`}>
                <div className="cc-column-track"><div className="cc-column-fill" style={{ height: `${order.progressPct}%` }}><span>{order.progressPct}%</span></div>{order.progressPct === 0 && <span className="cc-zero-label">0%</span>}</div>
                <strong>{order.orderNumber}</strong>
              </Link>)}</div>
            </div>
          </div>
          <div className="cc-commitment-list">{chartData.orderProgress.map((order) => {
            const source = priorityOrders.find((item) => item.id === order.id);
            return <Link href={`/orders/${order.id}`} key={order.id}><span className="cc-commitment-id">{order.orderNumber}</span><span className="cc-commitment-item">{order.itemName}</span><span className="cc-commitment-date">{source?.promisedDate ? new Date(source.promisedDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'No date'}</span></Link>;
          })}</div>
        </>}
      </Panel>
    </div>
  );
}
