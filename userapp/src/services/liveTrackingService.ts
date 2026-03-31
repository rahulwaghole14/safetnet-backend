import Geolocation, {GeolocationResponse} from '@react-native-community/geolocation';
import {Platform, PermissionsAndroid, Alert} from 'react-native';
import {useLiveTrackingStore, LatLng} from '../stores/liveTrackingStore';
import {distanceToSegmentMeters, haversineDistanceMeters} from '../utils/geo';
import {emitLiveTrackingDeviation} from './liveTrackingEventBus';
import {dispatchSOSAlert} from './sosDispatcher';
import {useAuthStore} from '../stores/authStore';

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  distanceFilter: 10,
  interval: 8000,
  fastestInterval: 4000,
  useSignificantChanges: false,
};

let watchId: number | null = null;
let isStarting = false;

import {permissionService} from './permissionService';

const ensureLocationPermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }
  return await permissionService.checkPermission('location');
};

const getCurrentPosition = () =>
  new Promise<LatLng>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position: GeolocationResponse) => {
        resolve({latitude: position.coords.latitude, longitude: position.coords.longitude});
      },
      (error) => reject(error),
      {...LOCATION_OPTIONS, timeout: 15000},
    );
  });

const handleDeviation = async (point: LatLng) => {
  const store = useLiveTrackingStore.getState();
  const session = store.session;
  if (!session) {
    return;
  }

  const {thresholdMeters, cooldownMs, autoEscalate} = store.settings;

  const distance = distanceToSegmentMeters(point, session.start, session.destination);
  if (distance < thresholdMeters) {
    return;
  }

  const lastDeviationTimestamp = store.deviation?.timestamp ?? 0;
  if (Date.now() - lastDeviationTimestamp < cooldownMs) {
    return;
  }

  const alert = {distance, timestamp: Date.now(), autoEscalated: autoEscalate};
  await store.setDeviation(alert);
  await store.appendDeviationHistory(alert);
  emitLiveTrackingDeviation(alert);

  try {
    if (autoEscalate) {
      const user = useAuthStore.getState().user;
      const name = user?.name ?? 'SafeTNet member';
      const message = `Route deviation detected for ${name}. Current location approx (${point.latitude.toFixed(
        4,
      )}, ${point.longitude.toFixed(4)}). Please check in.`;
      await dispatchSOSAlert(message);
    }
  } catch (error) {
    console.warn('Failed to dispatch SOS deviation alert', error);
  }
};

const handlePositionUpdate = async (point: LatLng) => {
  const store = useLiveTrackingStore.getState();
  await store.appendPoint(point);
  await handleDeviation(point);
};

export const startLiveTrackingSession = async (params: {destination: LatLng; etaMinutes: number}) => {
  if (isStarting) {
    return false;
  }
  isStarting = true;
  try {
    const hasPermission = await ensureLocationPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Location permission is needed to start live tracking.');
      isStarting = false;
      return false;
    }

    const startPoint = await getCurrentPosition();
    const session = {
      start: startPoint,
      destination: params.destination,
      etaMinutes: params.etaMinutes,
      startedAt: Date.now(),
    };
    await useLiveTrackingStore.getState().initializeSession(session);

    if (watchId !== null) {
      Geolocation.clearWatch(watchId);
    }

    watchId = Geolocation.watchPosition(
      async (position) => {
        const {latitude, longitude} = position.coords;
        await handlePositionUpdate({latitude, longitude});
      },
      (error) => {
        console.warn('Live tracking position error', error);
      },
      LOCATION_OPTIONS,
    );

    isStarting = false;
    return true;
  } catch (error) {
    console.error('Unable to start live tracking session', error);
    Alert.alert('Unable to start tracking', 'Please try again.');
    isStarting = false;
    return false;
  }
};

export const stopLiveTrackingSession = async () => {
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }
  await useLiveTrackingStore.getState().stopSession();
};

export const resumeLiveTrackingIfNeeded = async () => {
  const store = useLiveTrackingStore.getState();
  if (!store.session || !store.isTracking) {
    return;
  }

  if (watchId !== null) {
    return;
  }

  try {
    const hasPermission = await ensureLocationPermission();
    if (!hasPermission) {
      return;
    }

    watchId = Geolocation.watchPosition(
      async (position) => {
        const point = {latitude: position.coords.latitude, longitude: position.coords.longitude};
        await handlePositionUpdate(point);
      },
      (error) => console.warn('Live tracking resume error', error),
      LOCATION_OPTIONS,
    );
  } catch (error) {
    console.error('Failed to resume live tracking', error);
  }
};

export const getRemainingTravelMinutes = () => {
  const store = useLiveTrackingStore.getState();
  if (!store.session || !store.latest) {
    return null;
  }
  const speedMetersPerMinute = (() => {
    const {distanceTravelled, session} = store;
    const elapsedMinutes = (Date.now() - (session.startedAt ?? Date.now())) / (1000 * 60);
    if (elapsedMinutes <= 0.1 || distanceTravelled === 0) {
      return null;
    }
    return distanceTravelled / elapsedMinutes;
  })();

  if (!speedMetersPerMinute || speedMetersPerMinute <= 0) {
    return null;
  }

  return Math.round(store.remainingDistance / speedMetersPerMinute);
};

export const getArrivalProgress = () => {
  const store = useLiveTrackingStore.getState();
  if (!store.session) {
    return 0;
  }
  const totalDistance = haversineDistanceMeters(store.session.start, store.session.destination);
  if (totalDistance === 0) {
    return 100;
  }
  return Math.min(100, Math.round((store.distanceTravelled / totalDistance) * 100));
};
