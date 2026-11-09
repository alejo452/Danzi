package io.github.alejo452.danzi;

import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Complemento propio: guarda el archivo del progreso donde elijas (Ajustes › Tu progreso › Descargar).
        registerPlugin(SaveFilePlugin.class);
        // Complemento propio: toma o elige una foto y lee su texto en chino (Palabras › Leer un texto).
        registerPlugin(ChineseOcrPlugin.class);
        super.onCreate(savedInstanceState);
        // Mientras carga la página se ve el fondo de la app (claro u oscuro, según el celular), no un blanco.
        getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.app_background));
    }
}
