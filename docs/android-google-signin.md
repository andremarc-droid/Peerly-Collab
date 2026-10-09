# Android Google sign-in

Android uses the Capacitor Firebase Authentication plugin to open native Google sign-in, then exchanges its Google ID token with the Firebase JS SDK. The web app keeps its popup flow. The JS SDK uses IndexedDB persistence inside the Capacitor app.

## Firebase and GitHub Actions setup

1. In Firebase Console, enable Google under Authentication → Sign-in method and register an Android app with package name `com.peerly.collab`.
2. Create one stable debug keystore. Keep it outside the repository:

   ```sh
   keytool -genkeypair -v -keystore peerly-debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
   ```

3. Get its SHA-1 fingerprint and add it to the Android app in Firebase Project Settings → Your apps → SHA certificate fingerprints:

   ```sh
   keytool -list -v -keystore peerly-debug.keystore -alias androiddebugkey -storepass android
   ```

4. Download the updated `google-services.json` for `com.peerly.collab` after adding the fingerprint.
5. Add these repository secrets in GitHub Actions. The APK workflow uses them when it generates the Android project:
   - `GOOGLE_SERVICES_JSON`: the complete contents of the downloaded file.
   - `ANDROID_DEBUG_KEYSTORE_BASE64`: the keystore file encoded as base64 (`base64 -w 0 peerly-debug.keystore` on Linux; `[Convert]::ToBase64String([IO.File]::ReadAllBytes('peerly-debug.keystore'))` in PowerShell).

The APK workflow installs this stable key as the runner's Android debug keystore so its signing certificate matches the SHA-1 registered in Firebase. Do not commit the keystore or `google-services.json`. If you distribute a release-signed APK through Google Play, also add the Play App Signing SHA-1 fingerprint in Firebase.
