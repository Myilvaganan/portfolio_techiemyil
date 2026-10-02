package com.techiemyil.admin;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppLockPlugin.class);
        super.onCreate(savedInstanceState);
        // No native scroll indicator down the right edge, and no overscroll glow: the app scrolls like a native app.
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
        getBridge().getWebView().setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
        openLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openLink(intent);
    }

    /** Home-screen shortcuts and the widget open a page of the admin site (e.g. /today); load it in the app. */
    private void openLink(Intent intent) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null) return;
        String url;
        if ("admin.techiemyil.com".equals(uri.getHost())) {
            url = uri.toString();
        } else if ("techiemyil.com".equals(uri.getHost()) && "/admin/zerodha".equals(uri.getPath())) {
            // Kite's login callback: carry the token over to the journal's Zerodha page in the app.
            String q = uri.getEncodedQuery();
            url = "https://admin.techiemyil.com/zerodha" + (q != null ? "?" + q : "");
        } else {
            return;
        }
        final String target = url;
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(target));
    }
}
