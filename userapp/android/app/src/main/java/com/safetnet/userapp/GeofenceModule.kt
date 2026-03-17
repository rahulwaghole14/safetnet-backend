package com.safetnet.userapp

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class GeofenceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String = "GeofenceModule"
    
    @ReactMethod
    fun startGeofenceMonitoring(userId: Int, promise: Promise) {
        try {
            GeofenceMonitoringService.setUserId(reactApplicationContext, userId)
            GeofenceMonitoringService.setGeofenceEnabled(reactApplicationContext, true)
            GeofenceMonitoringService.startService(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("GEOFENCE_START_ERROR", "Failed to start geofence monitoring: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun stopGeofenceMonitoring(promise: Promise) {
        try {
            GeofenceMonitoringService.setGeofenceEnabled(reactApplicationContext, false)
            GeofenceMonitoringService.stopService(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("GEOFENCE_STOP_ERROR", "Failed to stop geofence monitoring: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun isGeofenceMonitoringActive(promise: Promise) {
        try {
            val isActive = GeofenceMonitoringService.isGeofenceEnabled(reactApplicationContext)
            promise.resolve(isActive)
        } catch (e: Exception) {
            promise.reject("GEOFENCE_CHECK_ERROR", "Failed to check geofence monitoring status: ${e.message}", e)
        }
    }
}

