package io.github.alejo452.danzi;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Guarda un archivo de texto donde elija la persona, con el diálogo «Guardar en…» de Android
 * (Descargas, Google Drive, etc.). La vista web de Android no descarga archivos por su cuenta,
 * así que «Descargar» en Ajustes › Tu progreso usa este complemento dentro de la APK.
 * Desde JavaScript: SaveFile.save({ name, data, mimeType }) → { saved: boolean }.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("data") == null) {
            call.reject("Faltan los datos del archivo.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "danzi.json"));
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            // La persona cerró el diálogo sin guardar.
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        byte[] bytes = call.getString("data", "").getBytes(StandardCharsets.UTF_8);
        try (OutputStream out = open(uri)) {
            if (out == null) {
                throw new IllegalStateException("No se pudo abrir el archivo.");
            }
            out.write(bytes);
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception e) {
            call.reject("No se pudo guardar el archivo.", e);
        }
    }

    /** Abre el archivo para escribirlo desde cero. Algunos destinos no aceptan el modo "wt"; ahí se usa "w". */
    private OutputStream open(Uri uri) throws Exception {
        try {
            return getContext().getContentResolver().openOutputStream(uri, "wt");
        } catch (IllegalArgumentException | UnsupportedOperationException e) {
            return getContext().getContentResolver().openOutputStream(uri, "w");
        }
    }
}
