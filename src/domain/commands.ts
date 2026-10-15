import { Principal } from '@/server/auth/principal';

export interface CommandInput<T> {
  idempotencyKey: string;
  expectedVersion?: number;
  payload: T;
}

export interface CommittedMeta {
  resourceVersion: number;
  workspaceRevision: number;
  requestId: string;
  replayed: boolean;
}

export interface Committed<T> {
  data: T;
  meta: CommittedMeta;
}
