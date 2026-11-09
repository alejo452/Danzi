import { describe, expect, it } from 'vitest';
import { errorCode, photoErrorMessage } from '../src/lib/ocr';

/** Un error como los que manda Capacitor desde Android: un Error con `code`. */
const fail = (code: string, message = 'Native message') => Object.assign(new Error(message), { code });

describe('leer el texto de una foto: errores', () => {
  it('lee el código de cualquier error, aunque no traiga', () => {
    expect(errorCode(fail('FOTO'))).toBe('FOTO');
    expect(errorCode({ code: 'LECTURA' })).toBe('LECTURA');
    expect(errorCode({ code: 7 })).toBe('');
    expect(errorCode(null)).toBe('');
    expect(errorCode('texto')).toBe('');
  });

  it('cada problema dice qué pasó y qué hacer, en español', () => {
    expect(photoErrorMessage(fail('SIN_CAMARA'), 'camara')).toBe('Este celular no tiene una app de cámara. Elige una foto de la galería.');
    // En Escritura en papel no hay galería ni texto para pegar: no los sugiere.
    expect(photoErrorMessage(fail('SIN_CAMARA'), 'camara', 'papel')).toBe(
      'Este celular no tiene una app de cámara, y este ejercicio la necesita. Practica la escritura en la pestaña Escribir.',
    );
    expect(photoErrorMessage(fail('SIN_SERVICIOS'), 'camara', 'papel')).not.toMatch(/pégalo/);
    expect(photoErrorMessage(fail('GALERIA'), 'galeria')).toBe('No se pudo abrir la galería. Vuelve a intentarlo.');
    expect(photoErrorMessage(fail('DESCARGANDO'), 'camara')).toMatch(/se está descargando.*Vuelve a intentarlo en un minuto/);
    expect(photoErrorMessage(fail('SIN_SERVICIOS'), 'galeria')).toMatch(/Google Play Services.*pégalo aquí/);
    expect(photoErrorMessage(fail('FOTO'), 'galeria')).toBe('No se pudo abrir la foto. Prueba con otra.');
    expect(photoErrorMessage(fail('FOTO'), 'camara')).toBe('No se pudo abrir la foto. Vuelve a tomarla.');
    expect(photoErrorMessage(fail('LECTURA', 'Internal error'), 'camara')).toBe('No se pudo leer el texto de la foto. Vuelve a intentarlo.');
  });

  it('un error sin código conocido depende de si era la cámara o la galería, y nunca muestra el mensaje técnico', () => {
    expect(photoErrorMessage(fail('UNIMPLEMENTED', 'ChineseOcr plugin is not implemented on android'), 'camara')).toBe('No se pudo tomar la foto. Vuelve a intentarlo.');
    expect(photoErrorMessage(new Error('Something broke'), 'galeria')).toBe('No se pudo abrir la foto. Prueba con otra.');
  });
});
