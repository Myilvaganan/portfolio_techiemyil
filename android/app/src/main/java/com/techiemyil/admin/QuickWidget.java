package com.techiemyil.admin;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** A home-screen widget with one-tap actions into the app: Today, add water, new note, scan a receipt. */
public class QuickWidget extends AppWidgetProvider {
    private static final String BASE = "https://admin.techiemyil.com";

    private PendingIntent open(Context ctx, String path, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(BASE + path), ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.quick_widget);
            v.setOnClickPendingIntent(R.id.w_today, open(ctx, "/today", 1));
            v.setOnClickPendingIntent(R.id.w_water, open(ctx, "/water?add=1", 2));
            v.setOnClickPendingIntent(R.id.w_note, open(ctx, "/diary", 3));
            v.setOnClickPendingIntent(R.id.w_receipt, open(ctx, "/receipts", 4));
            manager.updateAppWidget(id, v);
        }
    }
}
