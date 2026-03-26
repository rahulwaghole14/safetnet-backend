import { Platform } from 'react-native';
import {
  initConnection,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
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

const ANDROID_SUB_ID = 'premium_annual';
const BASE_PLAN_MONTHLY = 'monthly';
const BASE_PLAN_ANNUAL = 'annual';

const SKU_MONTHLY = Platform.select({
  ios: 'premium_monthly',
  android: ANDROID_SUB_ID,
}) || 'premium_monthly';

const SKU_ANNUAL = Platform.select({
  ios: 'premium_annual',
  android: ANDROID_SUB_ID,
}) || 'premium_annual';

const SKUS = Platform.select({
  ios: ['premium_monthly', 'premium_annual'],
  android: [ANDROID_SUB_ID],
}) || ['premium_monthly', 'premium_annual'];

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
    let purchaseResult;
    if (Platform.OS === 'android') {
      const basePlanId = plan === 'premium-monthly' ? BASE_PLAN_MONTHLY : BASE_PLAN_ANNUAL;
      
      // Fetch subscriptions to get the offerToken
      const subscriptions = await getStoreProducts();
      const sub = subscriptions.find(s => s.productId === ANDROID_SUB_ID);
      
      if (!sub || !('subscriptionOfferDetails' in sub)) {
        return { success: false, message: 'Subscription not found in store' };
      }
      
      const offer = sub.subscriptionOfferDetails.find(o => o.basePlanId === basePlanId);
      if (!offer) {
        return { success: false, message: `Base plan ${basePlanId} not found` };
      }

      purchaseResult = await requestSubscription({
        sku: ANDROID_SUB_ID,
        skus: [ANDROID_SUB_ID],
        subscriptionOffers: [
          {
            sku: ANDROID_SUB_ID,
            offerToken: offer.offerToken,
          },
        ],
        obfuscatedAccountIdAndroid: obfuscateBillingIdentifier(identity?.userId),
        obfuscatedProfileIdAndroid: obfuscateBillingIdentifier(identity?.email?.toLowerCase()),
      } as any);
    } else {
      purchaseResult = await requestPurchase({
        sku,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });
    }
    
    const purchase = Array.isArray(purchaseResult) ? purchaseResult[0] : purchaseResult;

    if (!purchase) {
      return { success: false, message: 'Purchase failed' };
    }

    // 2. Verify with backend
    const verificationResult = await apiService.verifyGooglePurchase({
      purchase_token: purchase.purchaseToken || '',
      subscription_id: Platform.OS === 'android' ? ANDROID_SUB_ID : sku,
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
