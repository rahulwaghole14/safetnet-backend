package com.safetnet.securityapp

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SirenModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var mediaPlayer: MediaPlayer? = null

    override fun getName(): String = "SirenModule"

    @ReactMethod
    fun playSiren() {
        try {
            stopSiren()
            val context = reactApplicationContext
            val resId = context.resources.getIdentifier("siren", "raw", context.packageName)
            if (resId != 0) {
                mediaPlayer = MediaPlayer.create(context, resId).apply {
                    val audioAttributes = AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build()
                    setAudioAttributes(audioAttributes)
                    isLooping = false
                    start()
                }
                Log.d("SirenModule", "Siren sound playback started")
            } else {
                Log.w("SirenModule", "Raw siren resource not found")
            }
        } catch (e: Exception) {
            Log.e("SirenModule", "Error playing siren", e)
        }
    }

    @ReactMethod
    fun stopSiren() {
        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.release()
            }
            mediaPlayer = null
            Log.d("SirenModule", "Siren sound playback stopped")
        } catch (e: Exception) {
            Log.e("SirenModule", "Error stopping siren", e)
        }
    }
}
