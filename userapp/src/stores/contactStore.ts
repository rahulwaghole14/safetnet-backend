import {create} from 'zustand';
import {apiService} from '../services/apiService';
import {useAuthStore} from './authStore';
import {getAsyncStorage} from '../utils/asyncStorageInit';

export type ContactType = 'Family' | 'Emergency' | 'Friend';

export interface EmergencyContact {
  id: number | string;
  name: string;
  phone: string;
  email?: string;
  type: ContactType;
  relationship?: string;
}

interface ContactStoreState {
  contacts: any[];
  primaryContactId?: string;
  initialized: boolean;
  loadContacts: () => Promise<void>;
  addContact: (contact: any) => Promise<void>;
  updateContact: (id: number | string, contact: any) => Promise<void>;
  deleteContact: (id: number | string) => Promise<void>;
  setPrimaryContact: (id: string) => Promise<void>;
  reset: () => void;
}

const CONTACT_CACHE_PREFIX = 'familyContacts';
const getCacheKey = (userId: number | string) => `${CONTACT_CACHE_PREFIX}_${userId}`;

export const useContactStore = create<ContactStoreState>((set, get) => ({
  contacts: [],
  primaryContactId: undefined,
  initialized: false,
  loadContacts: async () => {
    const user = useAuthStore.getState().user;
    if (!user?.id) {
      set({contacts: [], initialized: true});
      return;
    }
    const storage = await getAsyncStorage();
    const cacheKey = getCacheKey(user.id);
    try {
      const response = await apiService.getFamilyContacts(user.id);
      const contacts = Array.isArray(response) ? response : response?.contacts || [];
      set({contacts, initialized: true});
      await storage.setItem(cacheKey, JSON.stringify(contacts));
    } catch (error) {
      console.error('Error loading contacts:', error);
      try {
        const cached = await storage.getItem(cacheKey);
        const parsed = cached ? JSON.parse(cached) : [];
        set({contacts: parsed, initialized: true});
      } catch (cacheError) {
        console.error('Error loading cached contacts:', cacheError);
        set({contacts: [], initialized: true});
      }
    }
  },
  addContact: async (contact: any) => {
    const currentContacts = get().contacts;
    const updated = [...currentContacts, contact];
    set({contacts: updated});
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      const storage = await getAsyncStorage();
      await storage.setItem(getCacheKey(userId), JSON.stringify(updated));
    }
  },
  updateContact: async (id: number | string, contact: any) => {
    const currentContacts = get().contacts;
    const updated = currentContacts.map((c: any) =>
      c.id === id || String(c.id) === String(id) ? {...c, ...contact} : c,
    );
    set({contacts: updated});
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      const storage = await getAsyncStorage();
      await storage.setItem(getCacheKey(userId), JSON.stringify(updated));
    }
  },
  deleteContact: async (id: number | string) => {
    const filtered = get().contacts.filter((c: any) => c.id !== id && String(c.id) !== String(id));
    let primaryContactId = get().primaryContactId;
    if (primaryContactId === id.toString()) {
      primaryContactId = filtered[0]?.id?.toString();
    }
    set({contacts: filtered, primaryContactId});
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      const storage = await getAsyncStorage();
      await storage.setItem(getCacheKey(userId), JSON.stringify(filtered));
    }
  },
  setPrimaryContact: async (id: string) => {
    const exists = get().contacts.some((contact: any) => contact.id?.toString() === id);
    if (!exists) {
      return;
    }
    set({primaryContactId: id});
  },
  reset: () => {
    set({contacts: [], primaryContactId: undefined, initialized: false});
  },
}));
