// Manda un HTML a la impresora del sistema (que en Windows incluye "Guardar
// como PDF" y "Microsoft Print to PDF"). Sin librerías: el diálogo de impresión
// del sistema operativo hace el PDF.
//
// Se imprime dentro de un IFRAME oculto, no la página de la app: así el dossier
// sale solo, sin la navegación ni las pantallas de Zalent alrededor, y sin
// tener que pelearse con `@media print` sobre una interfaz compleja. El iframe
// hereda la CSP de la app, pero el HTML es autocontenido (estilos en línea, sin
// recursos externos ni scripts), así que la CSP estricta no lo bloquea.

export function printHtml(html: string): void {
  const iframe = document.createElement("iframe");
  // Fuera de la vista, pero presente en el DOM (no `display:none`: algunos
  // motores no imprimen lo que está totalmente oculto).
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("no se pudo preparar la vista de impresión");
  }

  // Cuando el usuario cierra el diálogo (imprima o cancele), se retira el
  // iframe. Un pequeño margen porque `afterprint` no dispara en todos los
  // motores; el timeout es la red de seguridad para no dejar iframes colgando.
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 60000);

  doc.open();
  doc.write(html);
  doc.close();

  // El contenido ya es HTML estático; basta esperar al siguiente ciclo para que
  // el iframe lo haya maquetado antes de abrir el diálogo.
  win.setTimeout(() => {
    win.focus(); // algunos motores imprimen la ventana enfocada
    win.print();
  }, 50);
}
