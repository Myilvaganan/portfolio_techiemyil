package com.techiemyil.admin;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * App lock: Android's own biometric prompt (fingerprint or face), with the phone's PIN / pattern / password as a
 * fallback. Errors come back with Android's own message so the app can show exactly what went wrong.
 */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void status(PluginCall call) {
        int code = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject r = new JSObject();
        r.put("available", code == BiometricManager.BIOMETRIC_SUCCESS);
        r.put("code", code);
        r.put("reason", reasonFor(code));
        call.resolve(r);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        int code = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        if (code != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject(reasonFor(code), String.valueOf(code));
            return;
        }
        final String title = call.getString("title", "Unlock Myil Admin");
        final String subtitle = call.getString("subtitle", "Confirm it's you");
        final FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    call.resolve();
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    call.reject(String.valueOf(errString), "E" + errorCode);
                }
                // onAuthenticationFailed (a finger not recognised) keeps the prompt open for another try.
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build();
            prompt.authenticate(info);
        });
    }

    private static String reasonFor(int code) {
        switch (code) {
            case BiometricManager.BIOMETRIC_SUCCESS: return "";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED: return "No fingerprint, face or screen lock is set up. Add one in Android Settings → Security.";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE: return "This phone has no fingerprint or face sensor available to apps.";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE: return "The fingerprint sensor is busy or unavailable right now. Try again.";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED: return "Android needs a security update before apps can use the fingerprint sensor.";
            default: return "Fingerprint unlock isn't available on this phone (code " + code + ").";
        }
    }
}
