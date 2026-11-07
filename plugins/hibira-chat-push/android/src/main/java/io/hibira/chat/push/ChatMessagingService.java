package io.hibira.chat.push;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.RemoteMessage;
import io.hibira.push.fcm.MessagingService;

/**
 * Firebase shows a notice itself while the app is in the background; while
 * it is open the notice comes here, and this shows it the same way. Either
 * way a tap opens the app with the notice's url.
 */
public class ChatMessagingService extends MessagingService {
    static final String CHANNEL = "chats";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        RemoteMessage.Notification n = message.getNotification();
        if (n == null) {
            return;
        }
        Context ctx = getApplicationContext();
        channel(ctx);
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) {
            return;
        }
        String url = message.getData().get("url");
        if (url != null) {
            open.putExtra("url", url);
        }
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id = (url != null ? url : String.valueOf(System.currentTimeMillis())).hashCode();
        PendingIntent tap = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setContentTitle(n.getTitle())
            .setContentText(n.getBody())
            .setStyle(new NotificationCompat.BigTextStyle().bigText(n.getBody()))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(tap);
        try {
            NotificationManagerCompat.from(ctx).notify(id, b.build());
        } catch (SecurityException noPermission) {
            // Notifications are off for the app.
        }
    }

    static void channel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) {
            return;
        }
        NotificationManager m = ctx.getSystemService(NotificationManager.class);
        if (m != null && m.getNotificationChannel(CHANNEL) == null) {
            m.createNotificationChannel(new NotificationChannel(CHANNEL, "Chats", NotificationManager.IMPORTANCE_HIGH));
        }
    }
}
