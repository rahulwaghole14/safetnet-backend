package com.safetnet.securityapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.RingtoneManager
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
          add(ReactNativeFirebaseAppPackage())
          add(ReactNativeFirebaseMessagingPackage())
          
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
      val name = "SafeTNet Emergency Alerts"
      val descriptionText = "Critical SOS and emergency notifications"
      val importance = NotificationManager.IMPORTANCE_HIGH
      val channel = NotificationChannel("sos_alerts", name, importance).apply {
        description = descriptionText
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 500, 200, 500)
        setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), null)
      }
      val notificationManager: NotificationManager =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.createNotificationChannel(channel)
    }
  }
}
