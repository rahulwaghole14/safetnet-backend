package com.safetnet.userapp

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

class ShakeDetectionService : Service(), SensorEventListener {
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var lastAcceleration: FloatArray = floatArrayOf(0f, 0f, 0f)
    private var shakeTimestamps: MutableList<Long> = mutableListOf()
    private var lastShakeTime: Long = 0
    private var wakeLock: PowerManager.WakeLock? = null
    private var sharedPreferences: SharedPreferences? = null
    
    // Shake detection parameters - very strict to prevent false positives
    private val THRESHOLD = 30.0f // m/s² - increased for native service
    private val SHAKE_COUNT = 3
    private val TIME_WINDOW = 2000L // 2 seconds
    private val MIN_SHAKE_INTERVAL = 600L // 600ms
    private val MIN_DEVIATION_FROM_GRAVITY = 18.0f // Increased
    private val MIN_AXIS_DELTA = 15.0f // Increased
    private val MIN_CURRENT_MAGNITUDE = 18.0f // Increased
    
    companion object {
        private const val CHANNEL_ID = "shake_detection_service"
        private const val NOTIFICATION_ID = 1
        private const val WAKE_LOCK_TAG = "ShakeDetectionService::WakeLock"
        private const val PREFS_NAME = "userapp_settings"
        private const val PREFS_KEY_SHAKE_ENABLED = "shakeToSendSOS"
        
        fun startService(context: Context) {
            val intent = Intent(context, ShakeDetectionService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, ShakeDetectionService::class.java)
            context.stopService(intent)
        }
        
        fun isShakeEnabled(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(PREFS_KEY_SHAKE_ENABLED, false)
        }
        
        fun setShakeEnabled(context: Context, enabled: Boolean) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(PREFS_KEY_SHAKE_ENABLED, enabled).apply()
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        
        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        // Check if shake detection is enabled
        val isEnabled = sharedPreferences?.getBoolean(PREFS_KEY_SHAKE_ENABLED, false) ?: false
        if (!isEnabled) {
            // Stop service if not enabled
            stopSelf()
            return
        }
        
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        
        // Acquire wake lock to keep service running
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            WAKE_LOCK_TAG
        )
        wakeLock?.acquire(10 * 60 * 60 * 1000L) // 10 hours
        
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Check if shake detection is still enabled
        val isEnabled = sharedPreferences?.getBoolean(PREFS_KEY_SHAKE_ENABLED, false) ?: false
        if (!isEnabled) {
            stopSelf()
            return START_NOT_STICKY
        }
        
        // Start accelerometer
        accelerometer?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        
        return START_STICKY // Restart if killed
    }
    
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
    
    override fun onDestroy() {
        super.onDestroy()
        sensorManager?.unregisterListener(this)
        wakeLock?.release()
    }
    
    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) return
        
        // Check if still enabled
        val isEnabled = sharedPreferences?.getBoolean(PREFS_KEY_SHAKE_ENABLED, false) ?: false
        if (!isEnabled) {
            stopSelf()
            return
        }
        
        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        
        val now = System.currentTimeMillis()
        
        // Prevent rapid shake detections
        if (now - lastShakeTime < MIN_SHAKE_INTERVAL) {
            lastAcceleration = floatArrayOf(x, y, z)
            return
        }
        
        // Calculate magnitude
        val currentMagnitude = Math.sqrt((x * x + y * y + z * z).toDouble()).toFloat()
        val lastMagnitude = Math.sqrt(
            (lastAcceleration[0] * lastAcceleration[0] +
             lastAcceleration[1] * lastAcceleration[1] +
             lastAcceleration[2] * lastAcceleration[2]).toDouble()
        ).toFloat()
        
        val magnitudeChange = Math.abs(currentMagnitude - lastMagnitude)
        
        // Calculate deltas
        val deltaX = Math.abs(x - lastAcceleration[0])
        val deltaY = Math.abs(y - lastAcceleration[1])
        val deltaZ = Math.abs(z - lastAcceleration[2])
        val totalDelta = Math.sqrt((deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ).toDouble()).toFloat()
        
        // Calculate thresholds - very strict
        val magnitudeThreshold = THRESHOLD * 0.9f // 27.0 m/s²
        val deltaThreshold = THRESHOLD * 1.1f // 33.0 m/s²
        val deviationFromGravity = Math.abs(currentMagnitude - 9.8f)
        val maxAxisDelta = Math.max(deltaX, Math.max(deltaY, deltaZ))
        
        // Check all conditions - ALL must be met
        if (magnitudeChange > magnitudeThreshold &&
            totalDelta > deltaThreshold &&
            deviationFromGravity > MIN_DEVIATION_FROM_GRAVITY &&
            maxAxisDelta > MIN_AXIS_DELTA &&
            currentMagnitude > MIN_CURRENT_MAGNITUDE) {
            
            lastShakeTime = now
            
            // Remove old timestamps
            shakeTimestamps.removeAll { now - it > TIME_WINDOW }
            
            // Add new shake
            if (shakeTimestamps.isEmpty() ||
                (shakeTimestamps.isNotEmpty() &&
                 now - shakeTimestamps.last() <= TIME_WINDOW / 2)) {
                shakeTimestamps.add(now)
            } else {
                shakeTimestamps.clear()
                shakeTimestamps.add(now)
            }
            
            // Check if 3 shakes detected
            if (shakeTimestamps.size >= SHAKE_COUNT) {
                val firstShake = shakeTimestamps[0]
                val lastShake = shakeTimestamps.last()
                val timeSpan = lastShake - firstShake
                
                if (timeSpan <= TIME_WINDOW) {
                    shakeTimestamps.clear()
                    handleShakeDetected()
                }
            }
        }
        
        lastAcceleration = floatArrayOf(x, y, z)
    }
    
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }
    
    private fun handleShakeDetected() {
        // Vibrate on 3rd shake (before sending notification)
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val vibrationEffect = VibrationEffect.createOneShot(1000, VibrationEffect.DEFAULT_AMPLITUDE)
                vibrator.vibrate(vibrationEffect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(1000)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        // Check if app is running in foreground
        val isAppRunning = try {
            val reactContext = applicationContext as? com.facebook.react.bridge.ReactApplicationContext
            reactContext != null && reactContext.hasActiveCatalystInstance()
        } catch (e: Exception) {
            false
        }
        
        if (isAppRunning) {
            // App is running - send event to JavaScript to show modal directly
            android.util.Log.d("ShakeDetection", "App is running - sending event to show modal")
            try {
                val reactContext = applicationContext as? com.facebook.react.bridge.ReactApplicationContext
                reactContext?.let {
                    val eventEmitter = it.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    eventEmitter.emit("ShakeDetected", null)
                }
            } catch (e: Exception) {
                android.util.Log.w("ShakeDetection", "Could not send event to JavaScript: ${e.message}")
                // Fallback to notification
                sendSOSNotification()
            }
        } else {
            // App is closed or in background - send notification
            // User clicks notification to open app with modal
            android.util.Log.d("ShakeDetection", "App is closed/in background - sending notification")
            sendSOSNotification()
        }
    }
    
    private fun sendSOSNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        // Create a separate channel for SOS notifications with high importance
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val sosChannel = NotificationChannel(
                "sos_channel",
                "SOS Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Emergency SOS alerts"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500)
                enableLights(true)
                setShowBadge(true)
            }
            notificationManager.createNotificationChannel(sosChannel)
        }
        
        // Create intent to open app with shake trigger
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                    Intent.FLAG_ACTIVITY_CLEAR_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            action = "com.safetnet.userapp.TRIGGER_SOS_FROM_SHAKE"
            putExtra("triggerSource", "shake")
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val channelId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) "sos_channel" else CHANNEL_ID
        
        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Shake Detected - SOS Alert")
            .setContentText("Tap to open app and confirm sending SOS")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION))
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .setLights(0xFF0000, 1000, 1000)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(pendingIntent, true) // Show as heads-up notification
            .build()
        
        notificationManager.notify(2, notification)
        android.util.Log.d("ShakeDetection", "SOS notification sent - user can tap to open app")
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Shake Detection Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Service for detecting shake gestures"
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
            .setContentTitle("Shake Detection Active")
            .setContentText("SOS shake detection is running in the background")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
}
