package com.techiemyil.admin;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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
        if (uri == null || !"admin.techiemyil.com".equals(uri.getHost())) return;
        final String url = uri.toString();
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
    }
}
