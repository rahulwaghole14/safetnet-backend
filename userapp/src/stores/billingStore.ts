import {create} from 'zustand';
import {requestStorePurchase, restoreStorePurchases, BillingPlan, initIAP} from '../services/billingService';
import {useAuthStore} from './authStore';
import {apiService} from '../services/apiService';

interface BillingState {
  isProcessing: boolean;
  lastError?: string;
  init: () => Promise<void>;
  upgrade: (plan: BillingPlan, promoCode?: string) => Promise<boolean>;
  restore: () => Promise<boolean>;
  clearError: () => void;
}

export const useBillingStore = create<BillingState>((set, get) => ({
  isProcessing: false,
  lastError: undefined,
  init: async () => {
    await initIAP();
  },
  upgrade: async (plan, promoCode) => {
    set({isProcessing: true, lastError: undefined});
    try {
      // If there's a promo code, we might still use the legacy direct API for codes
      // But for real IAP, we use requestStorePurchase
      if (promoCode) {
         const result = await apiService.subscribe({ plan_type: plan, promo_code: promoCode });
         if (result.success) {
            await useAuthStore.getState().refreshProfile();
            set({isProcessing: false});
            return true;
         } else {
            set({isProcessing: false, lastError: result.error || 'Promo code activation failed'});
            return false;
         }
      }

      const billingUser = useAuthStore.getState().user;
      const result = await requestStorePurchase(plan, {
        userId: billingUser?.id,
        email: billingUser?.email,
      });
      if (result.success) {
        // Refresh profile to get latest plan info from backend
        await useAuthStore.getState().refreshProfile();
        set({isProcessing: false, lastError: undefined});
        return true;
      }
      set({isProcessing: false, lastError: result.message || 'Purchase failed'});
      return false;
    } catch (error: any) {
      set({isProcessing: false, lastError: error.message || 'Purchase failed'});
      return false;
    }
  },
  restore: async () => {
    set({isProcessing: true, lastError: undefined});
    try {
      const result = await restoreStorePurchases();
      if (result.success) {
        await useAuthStore.getState().refreshProfile();
        set({isProcessing: false, lastError: undefined});
        return true;
      }
      set({isProcessing: false, lastError: result.message || 'No active purchases found'});
      return false;
    } catch (error: any) {
      set({isProcessing: false, lastError: error.message || 'Restore failed'});
      return false;
    }
  },
  clearError: () => {
    set({lastError: undefined});
  },
}));

