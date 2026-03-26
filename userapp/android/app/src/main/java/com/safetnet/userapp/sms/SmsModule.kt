package com.safetnet.userapp.sms

import android.content.Intent
import android.net.Uri
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

    try {
      val sanitized = phoneNumber.replace("\\s+".toRegex(), "")
      // ACTION_SENDTO with "smsto:" opens the SMS app with recipient and message pre-filled
      // This is the Google Play compliant way to handle SMS for non-default apps
      val intent = Intent(Intent.ACTION_SENDTO).apply {
        data = Uri.parse("smsto:$sanitized")
        putExtra("sms_body", message)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_SMS_FAILED", error)
    }
  }
}
