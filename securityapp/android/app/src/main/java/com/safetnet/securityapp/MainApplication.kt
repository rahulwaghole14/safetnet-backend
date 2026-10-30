package com.safetnet.securityapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentResolver
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.google.firebase.FirebaseApp
import io.invertase.firebase.app.ReactNativeFirebaseAppPackage
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingPackage
import com.reactnativecommunity.asyncstorage.AsyncStoragePackage
import com.swmansion.gesturehandler.RNGestureHandlerPackage
import com.th3rdwave.safeareacontext.SafeAreaContextPackage
import com.swmansion.rnscreens.RNScreensPackage
import com.oblador.vectoricons.VectorIconsPackage
import com.reactnativecommunity.webview.RNCWebViewPackage
import com.agontuk.RNFusedLocation.RNFusedLocationPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Manually add packages to stabilize native module registration
          // Matches the successful pattern used in userapp to resolve linking issues
          add(AsyncStoragePackage())
          add(RNGestureHandlerPackage())
          add(SafeAreaContextPackage())
          add(RNScreensPackage())
          add(VectorIconsPackage())
          add(RNFusedLocationPackage())
          add(RNCWebViewPackage())
          add(ReactNativeFirebaseAppPackage())
          add(ReactNativeFirebaseMessagingPackage())
          add(SirenPackage())
          
          Log.d("MainApplication", "Manual packages added to reactHost")
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Initialize Firebase before React Native load
    try {
      if (FirebaseApp.getApps(this).isEmpty()) {
        FirebaseApp.initializeApp(this)
      }
    } catch (e: Exception) {
      Log.e("MainApplication", "Firebase initialization failed", e)
    }
    
    // Create notification channel BEFORE loading React Native
    try {
      createNotificationChannel()
    } catch (e: Exception) {
      Log.e("MainApplication", "Failed to create notification channel", e)
    }

    loadReactNative(this)
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager: NotificationManager =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

      // Clean up legacy channels if present
      try {
        notificationManager.deleteNotificationChannel("sos_alerts")
        notificationManager.deleteNotificationChannel("sos_alerts_v2")
      } catch (e: Exception) {
        // ignore
      }

      // Configure siren sound URI
      val soundUri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + packageName + "/raw/siren")
      val audioAttributes = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .build()

      val name = "SafeTNet Emergency SOS Alerts"
      val descriptionText = "Critical SOS and emergency notifications with siren"
      val importance = NotificationManager.IMPORTANCE_HIGH
      val channel = NotificationChannel("sos_alerts_v3", name, importance).apply {
        description = descriptionText
        enableVibration(true)
        enableLights(true)
        vibrationPattern = longArrayOf(0, 500, 200, 500)
        setSound(soundUri, audioAttributes)
      }
      notificationManager.createNotificationChannel(channel)

      // General alerts channel
      val generalChannel = NotificationChannel("general_alerts", "General & Security Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "General information and non-emergency security alerts"
        enableLights(true)
        enableVibration(true)
      }
      notificationManager.createNotificationChannel(generalChannel)
    }
  }
}
