package com.safetnet.userapp.calls

import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DirectCallModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DirectCallModule"

  @ReactMethod
  fun startDirectCall(phoneNumber: String, promise: Promise) {
    if (phoneNumber.isBlank()) {
      promise.reject("INVALID_NUMBER", "Phone number is empty")
      return
    }

    val sanitized = phoneNumber.replace("\\s+".toRegex(), "")
    // ACTION_DIAL opens the dialer without requiring permissions
    val intent = Intent(Intent.ACTION_DIAL).apply {
      data = Uri.parse("tel:$sanitized")
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }

    try {
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CALL_FAILED", "Unable to start call", error)
    }
  }
}
