package com.safetnet.userapp.calls

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DirectCallModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DirectCallModule"

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun startDirectCall(phoneNumber: String, promise: Promise) {
    if (phoneNumber.isBlank()) {
      promise.reject("INVALID_NUMBER", "Phone number is empty")
      return
    }

    val permissionStatus = ContextCompat.checkSelfPermission(
      reactContext,
      android.Manifest.permission.CALL_PHONE,
    )

    if (permissionStatus != PackageManager.PERMISSION_GRANTED) {
      promise.reject("MISSING_PERMISSION", "CALL_PHONE permission not granted")
      return
    }

    val sanitized = phoneNumber.replace("\\s+".toRegex(), "")
    val intent = Intent(Intent.ACTION_CALL).apply {
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





