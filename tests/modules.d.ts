// Tipos mínimos de las librerías de envío push que usan las pruebas (no traen los suyos).
declare module 'web-push' {
  const webpush: {
    generateRequestDetails(
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
      options: object,
    ): { method: string; headers: Record<string, string | number>; body: Buffer; endpoint: string };
  };
  export default webpush;
}

declare module 'http_ece' {
  const ece: { decrypt(body: Buffer, params: { version: string; privateKey: import('node:crypto').ECDH; authSecret: string }): Buffer };
  export default ece;
}
