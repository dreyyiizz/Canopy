package com.plantroof.canopy;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Only bundled UI is loaded; no remote page receives the native bridge. */
public final class MainActivity extends Activity {
    private WebView web;
    private final ExecutorService requests = Executors.newFixedThreadPool(2);
    private volatile boolean destroyed;
    private static final String ORIGIN = "https://app.canopy.local/";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(245,246,240));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith(ORIGIN)) {
                    String name = url.substring(ORIGIN.length());
                    if (name.isEmpty()) name = "index.html";
                    if (name.equals("index.html") || name.equals("app.js") || name.equals("styles.css")) {
                        try {
                            String mime = name.endsWith("html") ? "text/html" : name.endsWith("js") ? "application/javascript" : "text/css";
                            return new WebResourceResponse(mime, "UTF-8", getAssets().open(name));
                        } catch (Exception ignored) { }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });
        web.addJavascriptInterface(new LaptopBridge(), "LaptopBridge");
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(web);
        web.loadUrl(ORIGIN);
    }

    private final class LaptopBridge {
        @JavascriptInterface public void request(String id, String base, String token, String method, String path, String body) {
            if (destroyed) return;
            requests.execute(() -> {
                JSONObject result = new JSONObject();
                HttpURLConnection connection = null;
                try {
                    URI uri = new URI(base);
                    if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null
                            || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                            || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
                        throw new Exception("Enter a laptop address such as http://192.168.1.20:8765");
                    if (!(method.equals("GET") && path.equals("/api/status"))
                            && !(method.equals("POST") && path.equals("/api/roof"))) throw new Exception("Unsupported request");
                    connection = (HttpURLConnection) uri.resolve(path).toURL().openConnection();
                    connection.setConnectTimeout(4000);
                    connection.setReadTimeout(6000);
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestMethod(method);
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                    if (method.equals("POST")) {
                        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                        connection.setRequestProperty("Content-Type", "application/json");
                        connection.setDoOutput(true);
                        connection.setFixedLengthStreamingMode(bytes.length);
                        try (java.io.OutputStream out = connection.getOutputStream()) { out.write(bytes); }
                    }
                    int status = connection.getResponseCode();
                    InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    if (stream != null) try (InputStream input = stream) {
                        byte[] buffer = new byte[2048]; int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (bytes.size() + count > 32768) throw new Exception("Unexpected server response");
                            bytes.write(buffer, 0, count);
                        }
                    }
                    result.put("status", status);
                    result.put("data", new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())));
                } catch (Exception e) {
                    try { result.put("error", "Cannot reach the laptop. Check its address, connection key, and Wi-Fi. " + e.getMessage()); }
                    catch (Exception ignored) { }
                } finally { if (connection != null) connection.disconnect(); }
                final String script = "window.receiveLaptopResponse(" + JSONObject.quote(id) + "," + result + ")";
                runOnUiThread(() -> { if (!destroyed) web.evaluateJavascript(script, null); });
            });
        }
    }
    @Override protected void onDestroy() {
        destroyed = true;
        requests.shutdownNow();
        web.removeJavascriptInterface("LaptopBridge");
        web.destroy();
        super.onDestroy();
    }
}
