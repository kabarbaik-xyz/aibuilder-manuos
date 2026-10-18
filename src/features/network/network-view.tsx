'use client';

import React, { useState } from 'react';
import { useGraphStore } from '../../store/graph-store';
import { useUiStore } from '../../store/ui-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

export function NetworkView() {
  const store = useGraphStore();
  const { networkDeals, setScreen, receiveNetworkMaterial } = store;
  const openModal = useUiStore((s) => s.openModal);

  const [activeTab, setActiveTab] = useState<'capacity' | 'supply'>('capacity');
  const activeSupplyDeal = networkDeals.find((d) => d.targetRef === 'TB-24');
  const dealStatus = activeSupplyDeal ? activeSupplyDeal.status : 'NONE';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Factory network</h1>
          <p>Find the capacity or materials to keep work moving.</p>
        </div>
        <Button
          icon="factory"
          onClick={() => openModal('factory-info')}
        >
          Your profile
        </Button>
      </div>

      <div className="toolbar">
        <div className="segmented">
          <button
            type="button"
            className={activeTab === 'capacity' ? 'active' : ''}
            onClick={() => setActiveTab('capacity')}
          >
            <Icon name="factory" /> Capacity
          </button>
          <button
            type="button"
            className={activeTab === 'supply' ? 'active' : ''}
            onClick={() => setActiveTab('supply')}
          >
            <Icon name="truck" /> Supply & demand
          </button>
        </div>
        <span className="small muted">3 partners · consent-based sharing</span>
      </div>

      <div className="network-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Connected capabilities</h2>
              </div>
              <div className="legend">
                <span>
                  <span className="dot blue" /> Capacity
                </span>
                <span>
                  <span className="dot" /> Materials
                </span>
              </div>
            </div>

            <div className="network-map">
              <svg
                viewBox="0 0 660 260"
                role="img"
                aria-label="Precision Works connects to Nusantara for materials and Batam for capacity. Silent Shop has sharing off."
              >
                <path
                  d="M335 124C335 68 452 57 485 57"
                  fill="none"
                  stroke="#7b9feb"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
                <path
                  d="M335 139C335 201 452 207 485 207"
                  fill="none"
                  stroke="#82baa5"
                  strokeWidth="2"
                />
                <path
                  d="M485 79v104"
                  fill="none"
                  stroke="#7b9feb"
                  strokeWidth="1.5"
                />

                <g transform="translate(168 95)">
                  <rect
                    width="190"
                    height="65"
                    rx="12"
                    fill="#edf2ff"
                    stroke="#b3c6f4"
                  />
                  <text
                    x="20"
                    y="28"
                    fill="#2459df"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="12"
                    fontWeight="700"
                  >
                    Precision Works
                  </text>
                  <text
                    x="20"
                    y="47"
                    fill="#627086"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="11"
                  >
                    Your factory · Buyer & producer
                  </text>
                </g>

                <g transform="translate(431 28)">
                  <rect
                    width="200"
                    height="60"
                    rx="11"
                    fill="#fff"
                    stroke="#dfe6f0"
                  />
                  <text
                    x="15"
                    y="26"
                    fill="#182438"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="11"
                    fontWeight="700"
                  >
                    Batam CNC Hub
                  </text>
                  <text
                    x="15"
                    y="44"
                    fill="#627086"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="11"
                  >
                    Capacity partner · 210 h free
                  </text>
                </g>

                <g transform="translate(431 177)">
                  <rect
                    width="200"
                    height="60"
                    rx="11"
                    fill="#f3faf7"
                    stroke="#d2e8dc"
                  />
                  <text
                    x="15"
                    y="26"
                    fill="#182438"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="11"
                    fontWeight="700"
                  >
                    Nusantara Metalcraft
                  </text>
                  <text
                    x="15"
                    y="44"
                    fill="#14775d"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="11"
                  >
                    Supplier & capacity buyer
                  </text>
                </g>

                <g transform="translate(17 28)">
                  <rect
                    width="155"
                    height="60"
                    rx="11"
                    fill="#f8f9fc"
                    stroke="#e4e8f0"
                    strokeDasharray="3 3"
                  />
                  <text
                    x="15"
                    y="26"
                    fill="#627086"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="11"
                    fontWeight="650"
                  >
                    Silent Shop
                  </text>
                  <text
                    x="15"
                    y="44"
                    fill="#627086"
                    fontFamily="Plus Jakarta Sans"
                    fontSize="11"
                  >
                    Sharing off · private profile
                  </text>
                </g>

                <text
                  x="355"
                  y="63"
                  fill="#2459df"
                  fontFamily="Plus Jakarta Sans"
                  fontSize="11"
                >
                  Capacity
                </text>
                <text
                  x="354"
                  y="214"
                  fill="#14775d"
                  fontFamily="Plus Jakarta Sans"
                  fontSize="11"
                >
                  Materials
                </text>
              </svg>
            </div>

            <div className="privacy-note">
              <Icon name="lock" />
              Partners choose what they share. Private profiles stay private.
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  {activeTab === 'capacity'
                    ? 'Available partners'
                    : 'Material sources'}
                </h2>
              </div>
              <Badge variant="success">2 opted in</Badge>
            </div>
            <div className="partner-list">
              {[
                [
                  'BH',
                  'Batam CNC Hub',
                  'CNC milling · Precision machining',
                  '210 h',
                  'Free capacity',
                  true,
                ],
                [
                  'NM',
                  'Nusantara Metalcraft',
                  'Terminal blocks · Standard components',
                  'Nov 26',
                  'Material ETA',
                  true,
                ],
                [
                  'SS',
                  'Silent Shop',
                  'Profile details are private',
                  '—',
                  'Sharing off',
                  false,
                ],
              ].map(([initials, name, sub, val, label, isOptedIn], idx) => (
                <div key={idx} className="partner-row">
                  <span
                    className="factory-avatar"
                    style={
                      !isOptedIn
                        ? { background: '#f0f2f6', color: '#7d8799' }
                        : undefined
                    }
                  >
                    {initials}
                  </span>
                  <div className="partner-copy">
                    <h3>{name}</h3>
                    <p>{sub}</p>
                  </div>
                  {isOptedIn ? (
                    <>
                      <div className="partner-meta">
                        <div>
                          <strong>{val}</strong>
                          <span>{label}</span>
                        </div>
                      </div>
                      <Button
                        size="small"
                        onClick={() =>
                          openModal('deal', {
                            capacity: idx === 0,
                            partnerName: name,
                          })
                        }
                      >
                        View match
                      </Button>
                    </>
                  ) : (
                    <Badge variant="default" icon="lock">
                      Private
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  {activeTab === 'capacity'
                    ? 'A little room to recover'
                    : 'Your material need'}
                </h2>
              </div>
              <Badge
                variant={
                  dealStatus === 'ACCEPTED'
                    ? 'blue'
                    : dealStatus === 'COMPLETED'
                    ? 'success'
                    : 'warning'
                }
              >
                {dealStatus === 'ACCEPTED'
                  ? 'Accepted'
                  : dealStatus === 'COMPLETED'
                  ? 'Received'
                  : 'Open'}
              </Badge>
            </div>
            <div className="panel-body">
              <div className="need-highlight">
                <strong>
                  {activeTab === 'capacity'
                    ? 'Assembly · Order #1042'
                    : 'Terminal blocks · TB-24'}
                </strong>
                <p>
                  {activeTab === 'capacity'
                    ? '80 units · electrical assembly & QC'
                    : '42 units needed · supplier ETA Nov 27'}
                </p>
              </div>

              <div className="match-facts">
                <div>
                  <strong>
                    {activeTab === 'capacity' ? '210 h' : 'Nov 26'}
                  </strong>
                  <span>
                    {activeTab === 'capacity'
                      ? 'Partner capacity'
                      : 'Partner material ETA'}
                  </span>
                </div>
                <div>
                  <strong>
                    {activeTab === 'capacity' ? '+7.5%' : '1 day'}
                  </strong>
                  <span>
                    {activeTab === 'capacity'
                      ? 'Estimated cost'
                      : 'Earlier than supplier'}
                  </span>
                </div>
              </div>

              <p className="small muted">
                {activeTab === 'capacity'
                  ? 'Review process fit and partner acceptance before outsourcing.'
                  : 'Nusantara Metalcraft stocks a matching spec. Receive materials before starting blocked work.'}
              </p>

              <Button
                variant="primary"
                fullWidth
                className="mt"
                iconRight="arrow"
                onClick={() => {
                  if (dealStatus === 'ACCEPTED') {
                    receiveNetworkMaterial('deal-tb-24');
                  } else if (dealStatus === 'COMPLETED') {
                    setScreen('orchestrator');
                  } else {
                    openModal('deal', {
                      capacity: activeTab === 'capacity',
                      partnerName:
                        activeTab === 'capacity'
                          ? 'Batam CNC Hub'
                          : 'Nusantara Metalcraft',
                    });
                  }
                }}
              >
                {dealStatus === 'ACCEPTED'
                  ? 'Record material receipt'
                  : dealStatus === 'COMPLETED'
                  ? 'View recovered schedule'
                  : 'Review proposal'}
              </Button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Network activity</h2>
              </div>
            </div>
            <div className="panel-body">
              <div className="deal-line">
                <div className="between">
                  <strong className="small">Standard brackets</strong>
                  <Badge variant="success">Supply</Badge>
                </div>
                <p>Precision Works → Nusantara Metalcraft</p>
              </div>
              <div className="deal-line">
                <div className="between">
                  <strong className="small">CNC finishing</strong>
                  <Badge variant="blue">Capacity</Badge>
                </div>
                <p>Nusantara Metalcraft → Batam CNC Hub</p>
              </div>
              <div className="deal-line">
                <div className="between">
                  <strong className="small">Terminal blocks</strong>
                  <Badge
                    variant={
                      dealStatus === 'ACCEPTED'
                        ? 'blue'
                        : dealStatus === 'COMPLETED'
                        ? 'success'
                        : 'default'
                    }
                  >
                    {dealStatus === 'ACCEPTED'
                      ? 'Accepted'
                      : dealStatus === 'COMPLETED'
                      ? 'Received'
                      : 'Proposed'}
                  </Badge>
                </div>
                <p>Nusantara Metalcraft → Precision Works</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
