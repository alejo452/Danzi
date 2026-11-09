# Llave de «Danzi Pruebas»

`danzi-pruebas.p12` firma la versión de pruebas de cada pull request («Danzi Pruebas», id `io.github.alejo452.danzi.pruebas`). Como todas las versiones de prueba llevan la misma firma, una nueva se instala encima de la anterior, sin desinstalarla.

- Es pública a propósito: la contraseña es `danzi-pruebas` y está en `.github/workflows/android.yml`. Así la usa la compilación de cada pull request sin recibir secretos.
- Solo firma «Danzi Pruebas», que tiene su propio progreso de prueba. **Nunca la uses para la app normal**: esa se firma con la llave secreta de `DANZI_FIRMA_ANDROID`.
- `firma-sha256.txt` tiene su huella. El workflow comprueba que la APK de pruebas quedó firmada con esta llave.
