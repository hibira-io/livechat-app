package io.hibira.chat.push;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Sign-in with Apple, Google, Microsoft or GitHub from the inbox's sign-in
 * page.
 *
 * <p>Google refuses to sign in inside a web view, so the page asks this
 * plugin to open chat.hibira.io/auth/{provider}?app=android&… in the
 * phone's browser. The server ends the sign-in on io.hibira.chat://auth#…
 * (MainActivity's intent filter); this hands that URL back to the page,
 * which finishes the sign-in in the web view with a secret it kept, so
 * another app that claims the scheme gets nothing.
 */
@CapacitorPlugin(name = "HibiraChatAuth")
public class HibiraChatAuthPlugin extends Plugin {
    static final String SCHEME = "io.hibira.chat";
    private String pending;

    /** { url } → { url }: the URL the sign-in came back on. */
    @PluginMethod
    public void open(PluginCall call) {
        String raw = call.getString("url", "");
        Uri uri = Uri.parse(raw);
        if (!"https".equals(uri.getScheme()) || !HibiraChatPushPlugin.HOST.equals(uri.getHost())
                || uri.getPath() == null || !uri.getPath().startsWith("/auth/")) {
            call.reject("bad_request");
            return;
        }
        if (pending != null) {
            PluginCall old = getBridge().getSavedCall(pending);
            if (old != null) {
                old.resolve(result(SCHEME + "://auth#error=cancelled"));
                getBridge().releaseCall(old);
            }
        }
        call.setKeepAlive(true);
        getBridge().saveCall(call);
        pending = call.getCallbackId();
        try {
            Intent view = new Intent(Intent.ACTION_VIEW, uri);
            view.addCategory(Intent.CATEGORY_BROWSABLE);
            getActivity().startActivity(view);
        } catch (ActivityNotFoundException e) {
            pending = null;
            getBridge().releaseCall(call);
            call.reject("no_browser");
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !SCHEME.equals(uri.getScheme()) || !"auth".equals(uri.getHost())) {
            return;
        }
        intent.setData(null);
        PluginCall call = pending == null ? null : getBridge().getSavedCall(pending);
        pending = null;
        if (call == null) {
            return; // the page that asked is gone; the person taps again
        }
        call.resolve(result(uri.toString()));
        getBridge().releaseCall(call);
    }

    private static JSObject result(String url) {
        JSObject o = new JSObject();
        o.put("url", url);
        return o;
    }
}
