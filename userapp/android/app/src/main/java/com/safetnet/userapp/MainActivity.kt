package com.safetnet.userapp

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "userapp"
  
  /**
   * Override onCreate to handle intents when app is launched (works when app is closed)
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Check for shake intent in onCreate (when app is launched from closed state)
    handleShakeIntent(intent)
  }
  
  /**
   * Handle shake intent - called from both onCreate and onNewIntent
   */
  private fun handleShakeIntent(intent: Intent?) {
    if (intent?.action == "com.safetnet.userapp.TRIGGER_SOS_FROM_SHAKE" || 
        intent?.getStringExtra("triggerSource") == "shake") {
      android.util.Log.d("MainActivity", "Shake intent detected in onCreate/onNewIntent")
      // Intent will be read by HomeScreen when it mounts
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   * Disabled New Architecture due to ProgressBar compatibility issues with RefreshControl
   * and TurboModule registry errors with gesture handler
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    // Enable New Architecture for AsyncStorage TurboModule support
    // AsyncStorage requires New Architecture to work properly
    val fabricEnabled = true // Enable New Architecture for TurboModule support
    return DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
  }

  /**
   * Override onNewIntent to handle new intents when app is already running
   * This is called when the app is brought to foreground with a new intent
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent) // Update the intent so getIntent() returns the latest one
    // Handle shake intent when app is brought to foreground
    handleShakeIntent(intent)
  }
  
  /**
   * Override onResume to check for intent when app comes to foreground
   */
  override fun onResume() {
    super.onResume()
    // Check intent again when app resumes (in case it was missed)
    handleShakeIntent(intent)
  }

  /**
   * Override onKeyUp to prevent dev menu from opening when shake detection is active
   * KeyEvent.KEYCODE_MENU (82) is the keycode for the menu button that opens dev menu
   */
  override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
    // Always prevent dev menu from opening via shake (KEYCODE_MENU)
    // This ensures our shake detection works without interference
    if (keyCode == KeyEvent.KEYCODE_MENU) {
      return true // Consume the event, preventing dev menu from opening
    }
    return super.onKeyUp(keyCode, event)
  }
}
