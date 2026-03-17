package com.safetnet.userapp.sms

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SmsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val appContext = reactContext.applicationContext

  override fun getName(): String = "SmsModule"

  @ReactMethod
  fun sendDirectSms(phoneNumber: String, message: String, promise: Promise) {
    if (phoneNumber.isBlank()) {
      promise.reject("E_INVALID_PHONE", "Phone number cannot be empty")
      return
    }
    val permissionGranted =
      ContextCompat.checkSelfPermission(appContext, Manifest.permission.SEND_SMS) ==
        PackageManager.PERMISSION_GRANTED
    if (!permissionGranted) {
      promise.reject("E_PERMISSION_DENIED", "SEND_SMS permission not granted")
      return
    }

    try {
      val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        appContext.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION")
        SmsManager.getDefault()
      }
      
      if (smsManager == null) {
        promise.reject("E_SMS_FAILED", "SmsManager is null")
        return
      }
      
      // Check if message needs to be split (SMS has 160 character limit, or 70 for Unicode)
      val messageParts = smsManager.divideMessage(message)
      
      if (messageParts.size > 1) {
        // Long message - use sendMultipartTextMessage
        smsManager.sendMultipartTextMessage(phoneNumber, null, messageParts, null, null)
      } else {
        // Short message - use sendTextMessage
        smsManager.sendTextMessage(phoneNumber, null, message, null, null)
      }
      
      promise.resolve(true)
    } catch (error: SecurityException) {
      promise.reject("E_PERMISSION_DENIED", error)
    } catch (error: Exception) {
      promise.reject("E_SMS_FAILED", error)
    }
  }
}






