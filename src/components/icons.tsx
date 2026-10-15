import React from 'react';
import { FileCog, ShoppingCart, PackageCheck, Boxes, Users, Truck, Package, Ruler, MapPin, Network, Cog, UserRoundCog, Award, Tags, ClipboardCheck, Brain, Route, ArrowLeft } from 'lucide-react';
const symbols = {
 'arrow-left': ArrowLeft,
 engineering: FileCog, supply: ShoppingCart, receipt: PackageCheck, inventory: Boxes,
 customers: Users, supplier: Truck, delivery: Truck, item: Package, ruler: Ruler, location: MapPin,
 department: Network, machine: Cog, technician: UserRoundCog, certificate: Award,
 'order-type': Tags, checklist: ClipboardCheck, users: Users, brain: Brain, route: Route, box: Package,
};

const paths = {
  settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z" /><circle cx="12" cy="12" r="3" /></>,
  logout: <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" /></>,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  graph: (
    <>
      <rect x="3" y="9" width="6" height="6" rx="1.5" />
      <rect x="15" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" />
      <path d="M9 12h3V6h3M12 12v6h3" />
    </>
  ),
  work: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M8 6V3h8v3M3 11h18M9 11v3h6v-3" />
    </>
  ),
  order: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="m7 7 3 3m4 4 3 3m-3-7 3-3M7 17l3-3" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C8 2 4 3 3 4v15c3-2 6-1 9 1 3-2 6-3 9-1V4c-3-2-6-1-9 1Zm0 0v15" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bolt: <path d="m13 2-8 12h6l-1 8 9-13h-7l1-7Z" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-1v4m-2-2h4" />
    </>
  ),
  alert: (
    <>
      <path d="m10.3 4.5-8 14a1.5 1.5 0 0 0 1.3 2.3h16.8a1.5 1.5 0 0 0 1.3-2.3l-8-14a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4m0 4h.01" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  factory: (
    <>
      <path d="M3 21V10l6 3V7l6 4V3h5l1 18H3ZM7 17h1m4 0h1m4 0h1" />
    </>
  ),
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="m8 4 12 8-12 8V4Z" />,
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  reset: <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  chart: <path d="M3 3v18h18M7 15v3M12 10v8M17 6v12" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h12v11H3V6Zm12 5h4l3 4v2h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  flag: <path d="M5 21V3c5-3 9 3 14 0v11c-5 3-9-3-14 0" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
};

export type IconName = keyof typeof paths | keyof typeof symbols;

export interface IconProps {
  name: IconName;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, className = '', style }: IconProps) {
  if (name in symbols) {
    const Symbol = symbols[name as keyof typeof symbols];
    return <Symbol className={`icon ${className}`} style={style} strokeWidth={1.7} aria-hidden="true" />;
  }
  const content = paths[name as keyof typeof paths];
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={style}
    >
      {content}
    </svg>
  );
}
