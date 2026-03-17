package com.safetnet.userapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // Check if shake detection is enabled
            if (ShakeDetectionService.isShakeEnabled(context)) {
                // Start the service on boot
                ShakeDetectionService.startService(context)
            }
            
            // Check if geofence monitoring is enabled
            if (GeofenceMonitoringService.isGeofenceEnabled(context)) {
                // Start the geofence service on boot
                GeofenceMonitoringService.startService(context)
            }
        }
    }
}




