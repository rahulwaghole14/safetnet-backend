package com.safetnet.securityapp

import android.os.Bundle
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentResolver
import android.media.AudioAttributes
import android.net.Uri
import androidx.activity.enableEdgeToEdge
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    createNotificationChannel()
  }

  private fun createNotificationChannel() {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
          val channelId = "sos_alerts"
          val name = "Emergency Alerts"
          val descriptionText = "Notifications for SOS and emergency security alerts"
          val importance = NotificationManager.IMPORTANCE_HIGH
          
          val channel = NotificationChannel(channelId, name, importance).apply {
              description = descriptionText
              
              // Configure the siren sound
              val soundUri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + packageName + "/raw/siren")
              val audioAttributes = AudioAttributes.Builder()
                  .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                  .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                  .build()
              
              setSound(soundUri, audioAttributes)
              enableLights(true)
              enableVibration(true)
          }
          
          // Register the channel with the system
          val notificationManager: NotificationManager =
              getSystemService(NotificationManager::class.java)
          notificationManager.createNotificationChannel(channel)
      }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "securityapp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
      val fabricEnabled = true // Explicitly enable for TurboModule support (matches userapp configuration)
      return DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
  }
}
