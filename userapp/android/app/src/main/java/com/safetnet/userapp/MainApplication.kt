package com.safetnet.userapp

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.google.firebase.FirebaseApp
import com.swmansion.gesturehandler.RNGestureHandlerPackage
import com.reactnativecommunity.asyncstorage.AsyncStoragePackage
import com.th3rdwave.safeareacontext.SafeAreaContextPackage
import com.swmansion.rnscreens.RNScreensPackage
import com.BV.LinearGradient.LinearGradientPackage
import com.reactnativecommunity.geolocation.GeolocationPackage
import com.dooboolab.rniap.RNIapPackage
import com.sensors.RNSensorsPackage
import com.safetnet.userapp.sms.SmsPackage
import com.safetnet.userapp.calls.DirectCallPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
            PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
            
            // Log all autolinked packages for debugging
            Log.d("MainApplication", "Autolinked packages: ${this.map { it.javaClass.simpleName }.joinToString()}")
            
            // Ensure AsyncStorage is registered - always add it explicitly to guarantee registration
            val hasAsyncStorage = this.any { 
              it.javaClass.name.contains("AsyncStoragePackage") || 
              it.javaClass.name.contains("AsyncStorage")
            }
            if (!hasAsyncStorage) {
              Log.w("MainApplication", "AsyncStoragePackage not found in autolinked packages, adding manually")
              add(AsyncStoragePackage())
            } else {
              Log.d("MainApplication", "AsyncStoragePackage found in autolinked packages")
            }
            
            add(VibrationPackage())
            add(DevMenuPackage())
            add(ShakeDetectionServicePackage())
            // Manually add gesture handler package to ensure it's registered
            add(RNGestureHandlerPackage())
            // Manually add SafeAreaContext package to ensure ViewManagers are registered
            add(SafeAreaContextPackage())
            // Manually add Screens package to ensure ViewManagers are registered
            add(RNScreensPackage())
            // Manually add LinearGradient package to ensure ViewManagers are registered
            add(LinearGradientPackage())
            
            // Always add Geolocation explicitly to guarantee it's registered
            try {
              val hasGeolocation = this.any { 
                it.javaClass.name.contains("GeolocationPackage") || 
                it.javaClass.name.contains("Geolocation")
              }
              if (!hasGeolocation) {
                Log.w("MainApplication", "GeolocationPackage not found in autolinked packages, adding manually")
                add(GeolocationPackage())
                Log.d("MainApplication", "GeolocationPackage added manually")
              } else {
                Log.d("MainApplication", "GeolocationPackage found in autolinked packages")
              }
            } catch (e: Exception) {
              Log.e("MainApplication", "Error checking/adding GeolocationPackage", e)
              // Still try to add it even if check failed
              try {
                add(GeolocationPackage())
                Log.d("MainApplication", "GeolocationPackage added after error")
              } catch (e2: Exception) {
                Log.e("MainApplication", "Failed to add GeolocationPackage", e2)
              }
            }
            
            // Ensure react-native-sensors is registered
            val hasSensors = this.any { 
              it.javaClass.name.contains("RNSensorsPackage") || 
              it.javaClass.name.contains("Sensors")
            }
            if (!hasSensors) {
              Log.w("MainApplication", "RNSensorsPackage not found in autolinked packages, adding manually")
              try {
                add(RNSensorsPackage())
                Log.d("MainApplication", "RNSensorsPackage added manually")
              } catch (e: Exception) {
                Log.e("MainApplication", "Failed to add RNSensorsPackage", e)
              }
            } else {
              Log.d("MainApplication", "RNSensorsPackage found in autolinked packages")
            }

            val hasIap = this.any {
              it.javaClass.name.contains("RNIapPackage") ||
              it.javaClass.name.contains("rniap")
            }
            if (!hasIap) {
              Log.w("MainApplication", "RNIapPackage not found in autolinked packages, adding manually")
              try {
                add(RNIapPackage())
                Log.d("MainApplication", "RNIapPackage added manually")
              } catch (e: Exception) {
                Log.e("MainApplication", "Failed to add RNIapPackage", e)
              }
            } else {
              Log.d("MainApplication", "RNIapPackage found in autolinked packages")
            }
            
            // Add SMS and Direct Call packages
            add(SmsPackage())
            add(DirectCallPackage())
            Log.d("MainApplication", "SmsPackage and DirectCallPackage added")
            
            // Add Geofence monitoring package
            add(GeofencePackage())
            Log.d("MainApplication", "GeofencePackage added")
            
            // Add Intent package for handling app launch intents
            add(IntentPackage())
            Log.d("MainApplication", "IntentPackage added")
            
            Log.d("MainApplication", "Final packages: ${this.map { it.javaClass.simpleName }.joinToString()}")
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    try {
      if (FirebaseApp.getApps(this).isEmpty()) {
        FirebaseApp.initializeApp(this)
      }
    } catch (exception: IllegalStateException) {
      Log.w("MainApplication", "Firebase not configured: ${exception.message}")
    } catch (exception: Exception) {
      Log.e("MainApplication", "Failed to initialize Firebase", exception)
    }
    loadReactNative(this)
  }
}
