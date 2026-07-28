# Ruta Madrid Pro

Aplicación móvil sin servidor para gestionar clientes, pedidos, compra consolidada, reparto, cobros y rentabilidad.

## Publicar en GitHub Pages
1. Crea un repositorio nuevo, por ejemplo `madrid-pro`.
2. Sube `index.html`, `styles.css`, `app.js`, `manifest.webmanifest` y `service-worker.js`.
3. En GitHub abre **Settings → Pages**.
4. Selecciona **Deploy from a branch**, rama `main`, carpeta `/root`.
5. Guarda y abre el enlace generado.

## Datos
Los datos se guardan en el navegador mediante `localStorage`. Usa **Más → Exportar backup** con frecuencia.

## Importación
En **Más → Importar versión antigua** se intentan copiar clientes y pedidos guardados por la aplicación antigua en el mismo navegador. Los precios de compra y venta deben completarse después.
