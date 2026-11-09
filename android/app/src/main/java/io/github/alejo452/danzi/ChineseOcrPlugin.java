package io.github.alejo452.danzi;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.moduleinstall.ModuleInstall;
import com.google.android.gms.common.moduleinstall.ModuleInstallClient;
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

/**
 * Toma o elige una foto y lee su texto en chino con ML Kit de Google, en el mismo celular: la foto no sale del
 * teléfono. La foto la toma la app de cámara del celular y la galería es el selector de fotos de Android, así que no
 * hace falta pedir permisos. El modelo de chino lo descarga Google Play Services una sola vez (la APK no lo trae, así
 * pesa menos).
 * Desde JavaScript (src/native/ocr.ts):
 * - ChineseOcr.prepare() → { ready }: pide la descarga del modelo si todavía no está, para tenerlo listo antes de
 *   la primera foto.
 * - ChineseOcr.pickPhoto({ source: "camara" | "galeria" }) → { uri }, sin `uri` si la persona cerró la cámara o la
 *   galería sin elegir.
 * - ChineseOcr.recognize({ uri }) → { text }.
 * Códigos de error (los mensajes para Diego están en src/lib/ocr.ts): SIN_CAMARA (no hay app de cámara), CAMARA y
 * GALERIA (no se pudieron abrir), SIN_SERVICIOS (el celular no tiene Google Play Services), DESCARGANDO (el modelo
 * todavía se está descargando), FOTO (no se pudo abrir la foto) y LECTURA (otro problema al leerla).
 */
@CapacitorPlugin(name = "ChineseOcr")
public class ChineseOcrPlugin extends Plugin {

    /** Lado más largo con el que se lee la foto. Basta para letra de libro y evita llenar la memoria con fotos enormes. */
    private static final int MAX_SIDE = 2600;

    private TextRecognizer recognizer;

    /** Se usa desde el hilo de los complementos y desde el principal (al pedir la descarga). */
    private synchronized TextRecognizer recognizer() {
        if (recognizer == null) {
            recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        }
        return recognizer;
    }

    private boolean hasPlayServices() {
        return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        if (!hasPlayServices()) {
            call.reject("Este celular no tiene Google Play Services.", "SIN_SERVICIOS");
            return;
        }
        ModuleInstallClient client = ModuleInstall.getClient(getContext());
        client
            .areModulesAvailable(recognizer())
            .addOnSuccessListener(available -> {
                if (available.areModulesAvailable()) {
                    resolveReady(call, true);
                    return;
                }
                client
                    .installModules(ModuleInstallRequest.newBuilder().addApi(recognizer()).build())
                    .addOnSuccessListener(response -> resolveReady(call, response.areModulesAlreadyInstalled()))
                    .addOnFailureListener(e -> call.reject("No se pudo pedir el lector de chino.", "DESCARGANDO", e));
            })
            .addOnFailureListener(e -> call.reject("No se pudo revisar el lector de chino.", "LECTURA", e));
    }

    private void resolveReady(PluginCall call, boolean ready) {
        JSObject ret = new JSObject();
        ret.put("ready", ready);
        call.resolve(ret);
    }

    /** Donde la app de cámara guarda la foto. Siempre la misma: la anterior se borra antes de tomar otra. */
    private File photoFile() {
        File dir = new File(getContext().getCacheDir(), "fotos");
        dir.mkdirs();
        return new File(dir, "foto.jpg");
    }

    @PluginMethod
    public void pickPhoto(PluginCall call) {
        boolean gallery = "galeria".equals(call.getString("source"));
        try {
            Intent intent;
            if (gallery) {
                intent = new ActivityResultContracts.PickVisualMedia().createIntent(
                    getContext(),
                    new PickVisualMediaRequest.Builder().setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build()
                );
            } else {
                File photo = photoFile();
                photo.delete();
                Uri output = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", photo);
                intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, output)
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            startActivityForResult(call, intent, gallery ? "photoPicked" : "photoTaken");
        } catch (ActivityNotFoundException e) {
            getBridge().releaseCall(call);
            call.reject(gallery ? "No hay galería." : "No hay app de cámara.", gallery ? "GALERIA" : "SIN_CAMARA", e);
        } catch (RuntimeException e) {
            getBridge().releaseCall(call);
            call.reject(gallery ? "No se pudo abrir la galería." : "No se pudo abrir la cámara.", gallery ? "GALERIA" : "CAMARA", e);
        }
    }

    @ActivityCallback
    private void photoTaken(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        getBridge().releaseCall(call);
        File photo = photoFile();
        if (result.getResultCode() != Activity.RESULT_OK) {
            resolvePhoto(call, null);
        } else if (photo.length() == 0) {
            call.reject("La cámara no guardó la foto.", "FOTO");
        } else {
            resolvePhoto(call, Uri.fromFile(photo).toString());
        }
    }

    @ActivityCallback
    private void photoPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        getBridge().releaseCall(call);
        Intent data = result.getData();
        Uri uri = result.getResultCode() == Activity.RESULT_OK && data != null ? data.getData() : null;
        resolvePhoto(call, uri != null ? uri.toString() : null);
    }

    private void resolvePhoto(PluginCall call, String uri) {
        JSObject ret = new JSObject();
        if (uri != null) {
            ret.put("uri", uri);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Falta la foto.", "FOTO");
            return;
        }
        if (!hasPlayServices()) {
            call.reject("Este celular no tiene Google Play Services.", "SIN_SERVICIOS");
            return;
        }
        InputImage image;
        try {
            image = loadImage(Uri.parse(uri));
        } catch (IOException | RuntimeException | OutOfMemoryError e) {
            call.reject("No se pudo abrir la foto.", "FOTO", e instanceof Exception ? (Exception) e : null);
            return;
        }
        recognizer()
            .process(image)
            .addOnSuccessListener(text -> {
                JSObject ret = new JSObject();
                ret.put("text", text.getText());
                call.resolve(ret);
            })
            .addOnFailureListener(e -> {
                boolean downloading = e instanceof MlKitException && ((MlKitException) e).getErrorCode() == MlKitException.UNAVAILABLE;
                call.reject(e.getMessage() != null ? e.getMessage() : "No se pudo leer la foto.", downloading ? "DESCARGANDO" : "LECTURA", e);
            });
    }

    /** Abre la foto achicada a MAX_SIDE (en potencias de 2, que es lo rápido) y con el giro que dice su EXIF. */
    private InputImage loadImage(Uri uri) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = open(resolver, uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw new IOException("No es una imagen.");
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > MAX_SIDE) {
            options.inSampleSize *= 2;
        }
        Bitmap bitmap;
        try (InputStream in = open(resolver, uri)) {
            bitmap = BitmapFactory.decodeStream(in, null, options);
        }
        if (bitmap == null) {
            throw new IOException("No se pudo abrir la imagen.");
        }
        return InputImage.fromBitmap(bitmap, rotation(resolver, uri));
    }

    private static InputStream open(ContentResolver resolver, Uri uri) throws IOException {
        InputStream in = resolver.openInputStream(uri);
        if (in == null) {
            throw new IOException("No se pudo abrir la imagen.");
        }
        return in;
    }

    /** Cuántos grados hay que girar la foto para verla derecha. Si no se sabe, 0. */
    private static int rotation(ContentResolver resolver, Uri uri) {
        try (InputStream in = open(resolver, uri)) {
            switch (new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    return 90;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    return 180;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    return 270;
                default:
                    return 0;
            }
        } catch (IOException | RuntimeException e) {
            return 0;
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) {
            recognizer.close();
            recognizer = null;
        }
        super.handleOnDestroy();
    }
}
