import { create } from 'zustand';
import type { Membership } from '@/lib/api/field';

/** Organization selected in Field mode (UI state only; the server re-checks every action). */
export const useFieldOrg = create<{ org: Membership | null; setOrg: (o: Membership | null) => void }>((set) => ({
  org: null,
  setOrg: (org) => set({ org }),
}));
