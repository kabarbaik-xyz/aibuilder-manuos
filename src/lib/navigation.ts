export type PersonaType = 'Owner' | 'Supervisor' | 'Technician' | 'Customer';
export type ScreenType = 'command' | 'orchestrator' | 'workstation' | 'customer' | 'network';

export interface ScreenConfig {
  id: ScreenType;
  title: string;
  icon: string;
  defaultPersona: PersonaType;
  allowedPersonas: PersonaType[];
}

export const SCREENS: ScreenConfig[] = [
  {
    id: 'command',
    title: 'Command center',
    icon: 'grid',
    defaultPersona: 'Owner',
    allowedPersonas: ['Owner', 'Supervisor'],
  },
  {
    id: 'orchestrator',
    title: 'Orchestrator',
    icon: 'graph',
    defaultPersona: 'Supervisor',
    allowedPersonas: ['Owner', 'Supervisor'],
  },
  {
    id: 'workstation',
    title: 'My workstation',
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
