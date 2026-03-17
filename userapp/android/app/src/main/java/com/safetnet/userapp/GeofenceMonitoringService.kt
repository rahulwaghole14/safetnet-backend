package com.safetnet.userapp

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.google.android.gms.tasks.Task
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class GeofenceMonitoringService : Service() {
    private var locationClient: FusedLocationProviderClient? = null
    private var locationRequest: LocationRequest? = null
    private var locationCallback: LocationCallback? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var sharedPreferences: SharedPreferences? = null
    private var executor: ScheduledExecutorService? = null
    private var lastKnownLocation: Location? = null
    
    companion object {
        private const val CHANNEL_ID = "geofence_monitoring_service"
        private const val NOTIFICATION_ID = 2
        private const val WAKE_LOCK_TAG = "GeofenceMonitoringService::WakeLock"
        private const val PREFS_NAME = "userapp_settings"
        private const val PREFS_KEY_GEOFENCE_ENABLED = "geofenceMonitoringEnabled"
        private const val PREFS_KEY_USER_ID = "userId"
        private const val PREFS_KEY_LAST_INSIDE_GEOFENCES = "lastInsideGeofences"
        
        private const val LOCATION_UPDATE_INTERVAL = 5000L // 5 seconds
        private const val FASTEST_UPDATE_INTERVAL = 3000L // 3 seconds
        private const val LOCATION_UPDATE_DISTANCE = 10f // 10 meters
        
        fun startService(context: Context) {
            val intent = Intent(context, GeofenceMonitoringService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, GeofenceMonitoringService::class.java)
            context.stopService(intent)
        }
        
        fun isGeofenceEnabled(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(PREFS_KEY_GEOFENCE_ENABLED, false)
        }
        
        fun setGeofenceEnabled(context: Context, enabled: Boolean) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(PREFS_KEY_GEOFENCE_ENABLED, enabled).apply()
        }
        
        fun setUserId(context: Context, userId: Int) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putInt(PREFS_KEY_USER_ID, userId).apply()
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        
        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        // Check if geofence monitoring is enabled
        val isEnabled = sharedPreferences?.getBoolean(PREFS_KEY_GEOFENCE_ENABLED, false) ?: false
        if (!isEnabled) {
            stopSelf()
            return
        }
        
        // Initialize location client
        locationClient = LocationServices.getFusedLocationProviderClient(this)
        
        // Create location request
        locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            LOCATION_UPDATE_INTERVAL
        )
            .setMinUpdateIntervalMillis(FASTEST_UPDATE_INTERVAL)
            .setMaxUpdateDelayMillis(LOCATION_UPDATE_INTERVAL * 2)
            .setWaitForAccurateLocation(false)
            .build()
        
        // Create location callback
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation
                if (location != null) {
                    lastKnownLocation = location
                    checkGeofences(location)
                }
            }
        }
        
        // Acquire wake lock to keep service running
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            WAKE_LOCK_TAG
        )
        wakeLock?.acquire(10 * 60 * 60 * 1000L) // 10 hours
        
        // Create executor for periodic geofence checks
        executor = Executors.newSingleThreadScheduledExecutor()
        
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Check if geofence monitoring is still enabled
        val isEnabled = sharedPreferences?.getBoolean(PREFS_KEY_GEOFENCE_ENABLED, false) ?: false
        if (!isEnabled) {
            stopSelf()
            return START_NOT_STICKY
        }
        
        // Request location updates
        requestLocationUpdates()
        
        // Schedule periodic geofence checks
        executor?.scheduleAtFixedRate({
            lastKnownLocation?.let { checkGeofences(it) }
        }, 5, 5, TimeUnit.SECONDS)
        
        return START_STICKY // Restart if killed
    }
    
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
    
    override fun onDestroy() {
        super.onDestroy()
        locationClient?.removeLocationUpdates(locationCallback!!)
        wakeLock?.release()
        executor?.shutdown()
    }
    
    private fun requestLocationUpdates() {
        try {
            val request = LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY,
                LOCATION_UPDATE_INTERVAL
            )
                .setMinUpdateIntervalMillis(FASTEST_UPDATE_INTERVAL)
                .setMaxUpdateDelayMillis(LOCATION_UPDATE_INTERVAL * 2)
                .setWaitForAccurateLocation(false)
                .build()
            
            val locationSettingsRequest = LocationSettingsRequest.Builder()
                .addLocationRequest(request)
                .build()
            
            val settingsClient = LocationServices.getSettingsClient(this)
            val task: Task<LocationSettingsResponse> = settingsClient.checkLocationSettings(locationSettingsRequest)
            
            task.addOnSuccessListener {
                // Location settings are satisfied, request updates
                locationClient?.requestLocationUpdates(
                    request,
                    locationCallback!!,
                    mainLooper
                )
            }
            
            task.addOnFailureListener { exception ->
                android.util.Log.e("GeofenceService", "Location settings not satisfied: ${exception.message}")
            }
        } catch (e: SecurityException) {
            android.util.Log.e("GeofenceService", "Location permission not granted: ${e.message}")
        }
    }
    
    private fun checkGeofences(location: Location) {
        val userId = sharedPreferences?.getInt(PREFS_KEY_USER_ID, -1) ?: -1
        if (userId == -1) {
            return
        }
        
        // This will be called from React Native module to check geofences
        // For now, we'll emit location updates to React Native
        try {
            val reactContext = applicationContext as? com.facebook.react.bridge.ReactApplicationContext
            reactContext?.let {
                val eventEmitter = it.getJSModule(
                    com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
                )
                val locationData = com.facebook.react.bridge.WritableNativeMap().apply {
                    putDouble("latitude", location.latitude)
                    putDouble("longitude", location.longitude)
                    putDouble("accuracy", location.accuracy.toDouble())
                    putDouble("timestamp", location.time.toDouble())
                }
                eventEmitter.emit("GeofenceLocationUpdate", locationData)
            }
        } catch (e: Exception) {
            android.util.Log.e("GeofenceService", "Error emitting location update: ${e.message}")
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Geofence Monitoring Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Service for monitoring geofence enter/exit events"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Geofence Monitoring Active")
            .setContentText("Monitoring geofence enter/exit events")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}

