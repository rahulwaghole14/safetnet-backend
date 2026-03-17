import { Platform } from 'react-native';
import {
  initConnection,
  getSubscriptions,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  Subscription,
  clearProductsIOS,
  flushFailedPurchasesCachedAsPendingAndroid,
} from 'react-native-iap';
import { apiService } from './apiService';

export type BillingPlan = 'free' | 'premium-monthly' | 'premium-annual';
export const GOOGLE_PLAY_PACKAGE_NAME = 'com.safetnet.userapp';

export interface BillingIdentity {
  userId?: string;
  email?: string;
}

export interface BillingProduct {
  id: BillingPlan;
  title: string;
  subtitle: string;
  price: string;
  badge?: string;
  savings?: string;
  localizedPrice?: string;
}

const SKU_MONTHLY = Platform.select({
  ios: 'premium_monthly',
  android: 'premium_monthly',
}) || 'premium_monthly';

const SKU_ANNUAL = Platform.select({
  ios: 'premium_annual',
  android: 'premium_annual',
}) || 'premium_annual';

const SKUS = [SKU_MONTHLY, SKU_ANNUAL];

/**
 * Static product info to fall back on if store fetch fails
 */
const PRODUCTS: BillingProduct[] = [
  {
    id: 'premium-monthly',
    title: 'Premium Monthly',
    subtitle: 'All advanced safety features, billed monthly.',
    price: '₹499 / month',
    badge: 'Most popular',
  },
  {
    id: 'premium-annual',
    title: 'Premium Annual',
    subtitle: 'Save 20% with yearly billing.',
    price: '₹4,799 / year',
    savings: 'Save ₹1,189/year',
  },
];

export const listBillingProducts = (): BillingProduct[] => PRODUCTS;
export const getGooglePlaySubscriptionsUrl = (): string =>
  `https://play.google.com/store/account/subscriptions?package=${GOOGLE_PLAY_PACKAGE_NAME}`;

const obfuscateBillingIdentifier = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return `stn_${Math.abs(hash).toString(16)}`;
};

/**
 * Initialize IAP connection
 */
export const initIAP = async (): Promise<boolean> => {
  try {
    const result = await initConnection();
    if (Platform.OS === 'android') {
      await flushFailedPurchasesCachedAsPendingAndroid();
    } else {
      await clearProductsIOS();
    }
    return result;
  } catch (err) {
    console.warn('IAP Init Error:', err);
    return false;
  }
};

/**
 * Fetch products from Store
 */
export const getStoreProducts = async (): Promise<Subscription[]> => {
  try {
    const subscriptions = await getSubscriptions({ skus: SKUS });
    return subscriptions;
  } catch (err) {
    console.warn('Get Store Products Error:', err);
    return [];
  }
};

/**
 * Main purchase flow
 */
export const requestStorePurchase = async (
  plan: BillingPlan,
  identity?: BillingIdentity,
): Promise<{ success: boolean; message?: string }> => {
  if (plan === 'free') {
    return { success: true };
  }

  const sku = plan === 'premium-monthly' ? SKU_MONTHLY : SKU_ANNUAL;

  try {
    // 1. Request purchase from store
    const purchaseResult = await requestPurchase({
      sku,
      andDangerouslyFinishTransactionAutomaticallyIOS: false,
      obfuscatedAccountIdAndroid:
        Platform.OS === 'android' ? obfuscateBillingIdentifier(identity?.userId) : undefined,
      obfuscatedProfileIdAndroid:
        Platform.OS === 'android'
          ? obfuscateBillingIdentifier(identity?.email?.toLowerCase())
          : undefined,
    });
    const purchase = Array.isArray(purchaseResult) ? purchaseResult[0] : purchaseResult;

    if (!purchase) {
      return { success: false, message: 'Purchase failed' };
    }

    // 2. Verify with backend
    const verificationResult = await apiService.verifyGooglePurchase({
      purchase_token: purchase.purchaseToken || '',
      subscription_id: sku,
      package_name: Platform.OS === 'android' ? GOOGLE_PLAY_PACKAGE_NAME : undefined,
    });

    if (verificationResult.success) {
      // 3. Finish transaction
      await finishTransaction({ purchase, isConsumable: false });
      return { success: true };
    } else {
      return { success: false, message: verificationResult.error || 'Verification failed' };
    }
  } catch (err: any) {
    console.warn('Purchase Error:', err);
    if (err.code === 'E_USER_CANCELLED') {
      return { success: false, message: 'Purchase cancelled' };
    }
    return { success: false, message: err.message || 'Purchase failed' };
  }
};

/**
 * Restore purchases
 */
export const restoreStorePurchases = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    const purchases = await getAvailablePurchases();
    
    if (purchases && purchases.length > 0) {
      // Find latest valid premium purchase
      const activePurchase = purchases.find(p => SKUS.includes(p.productId));
      
      if (activePurchase) {
        // Verify with backend
        const verificationResult = await apiService.verifyGooglePurchase({
          purchase_token: activePurchase.purchaseToken || '',
          subscription_id: activePurchase.productId,
          package_name: Platform.OS === 'android' ? GOOGLE_PLAY_PACKAGE_NAME : undefined,
        });

        if (verificationResult.success) {
          return { success: true, message: 'Subscription restored' };
        }
      }
    }
    
    return { success: false, message: 'No active subscriptions found' };
  } catch (err: any) {
    console.warn('Restore Error:', err);
    return { success: false, message: err.message || 'Restore failed' };
  }
};
