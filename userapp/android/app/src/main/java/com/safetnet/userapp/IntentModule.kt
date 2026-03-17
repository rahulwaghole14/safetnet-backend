package com.safetnet.userapp

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap

class IntentModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String = "IntentModule"
    
    @ReactMethod
    fun getInitialIntent(promise: Promise) {
        try {
            val currentActivity = reactApplicationContext.currentActivity
            if (currentActivity != null) {
                val intent = currentActivity.intent
                val action = intent?.action
                val extras = intent?.extras
                
                val result = WritableNativeMap()
                result.putString("action", action)
                
                if (extras != null && extras.containsKey("triggerSource")) {
                    result.putString("triggerSource", extras.getString("triggerSource"))
                }
                
                // Clear the intent action after reading to prevent re-triggering
                if (action == "com.safetnet.userapp.TRIGGER_SOS_FROM_SHAKE") {
                    intent?.action = ""
                }
                
                promise.resolve(result)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("INTENT_ERROR", "Failed to get initial intent: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun clearIntent(promise: Promise) {
        try {
            val currentActivity = reactApplicationContext.currentActivity
            if (currentActivity != null) {
                currentActivity.intent?.action = ""
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("INTENT_CLEAR_ERROR", "Failed to clear intent: ${e.message}", e)
        }
    }
}

