import apiClient from '../apiClient';

export const updateFCMToken = async (token: string): Promise<any> => {
    try {
        const response = await apiClient.post('/profile/update-fcm-token/', { token });
        console.log('✅ FCM Token updated');
        return response.data;
    } catch (error) {
        console.error('❌ Failed to update FCM Token', error);
        throw error;
    }
};
