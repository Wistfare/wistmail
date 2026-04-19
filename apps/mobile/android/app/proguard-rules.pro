# ── Flutter / engine entry points ────────────────────────────────────────────
# The Flutter engine reflects on these classes from native code; R8 must not
# rename or strip them.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# ── Firebase (FCM, Core) ─────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**

# ── OkHttp / Retrofit reflection (used transitively by some plugins) ─────────
-dontwarn okhttp3.**
-dontwarn okio.**

# ── Kotlin metadata for reflection-based libraries ───────────────────────────
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses

# ── App-side keep rules ──────────────────────────────────────────────────────
# Anything in our own package is fine to shrink/obfuscate; reflection-based
# JSON encoders are not used (the app uses hand-rolled fromJson factories).
