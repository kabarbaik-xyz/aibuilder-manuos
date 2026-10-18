import type { IconName } from '@/components/icons';
export type PersonaType = 'Owner' | 'Supervisor' | 'Technician' | 'Customer';
export type ScreenType = 'command' | 'orchestrator' | 'workstation' | 'customer' | 'network' | 'coreai' | 'orders' | 'risks' | 'inventory' | 'resources';

export interface ScreenConfig {
  id: ScreenType;
  title: string;
  icon: IconName;
  defaultPersona: PersonaType;
  allowedPersonas: PersonaType[];
}

export const SCREENS: ScreenConfig[] = [
  { id: 'coreai', title: 'CoreAI', icon: 'brain', defaultPersona: 'Owner', allowedPersonas: ['Owner', 'Supervisor'] },
  { id: 'orders', title: 'Order Hub', icon: 'order', defaultPersona: 'Owner', allowedPersonas: ['Owner', 'Supervisor'] },
  { id: 'risks', title: 'Risk inbox', icon: 'alert', defaultPersona: 'Owner', allowedPersonas: ['Owner', 'Supervisor'] },
  { id: 'inventory', title: 'Inventory', icon: 'box', defaultPersona: 'Owner', allowedPersonas: ['Owner', 'Supervisor'] },
  { id: 'resources', title: 'Machines & technicians', icon: 'factory', defaultPersona: 'Owner', allowedPersonas: ['Owner', 'Supervisor'] },
  {
    id: 'command',
    title: 'Dashboard',
    icon: 'grid',
    defaultPersona: 'Owner',
    allowedPersonas: ['Owner', 'Supervisor'],
  },
  {
    id: 'orchestrator',
    title: 'Production planning',
    icon: 'graph',
    defaultPersona: 'Supervisor',
    allowedPersonas: ['Owner', 'Supervisor'],
  },
  {
    id: 'workstation',
    title: 'Shop floor',
    icon: 'work',
    defaultPersona: 'Technician',
    allowedPersonas: ['Owner', 'Supervisor', 'Technician'],
  },
  {
    id: 'customer',
    title: 'Customer portal',
    icon: 'order',
    defaultPersona: 'Customer',
    allowedPersonas: ['Owner', 'Customer'],
  },
  {
    id: 'network',
    title: 'Factory network',
    icon: 'network',
    defaultPersona: 'Owner',
    allowedPersonas: ['Owner', 'Supervisor'],
  },
];

export const PERSONA_PROFILES: Record<PersonaType, {
  name: string;
  avatar: string;
  role: string;
  defaultScreen: ScreenType;
}> = {
  Owner: {
    name: 'Alex Rahman',
    avatar: 'AR',
    role: 'Owner & Managing Director',
    defaultScreen: 'command',
  },
  Supervisor: {
    name: 'Alex Rahman',
    avatar: 'AR',
    role: 'Production Supervisor & PPIC',
    defaultScreen: 'orchestrator',
  },
  Technician: {
    name: 'Hendra Wijaya',
    avatar: 'HW',
    role: 'CNC Specialist · Shift A',
    defaultScreen: 'workstation',
  },
  Customer: {
    name: 'Sarah Chen',
    avatar: 'SC',
    role: 'Procurement · Meridian Energy',
    defaultScreen: 'customer',
  },
};
