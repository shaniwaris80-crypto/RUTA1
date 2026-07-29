FACTURA AW v1.8 PRO
====================

Proyecto PWA completo para facturación profesional, pedidos, compras, stock, tiendas propias, mermas, cobros, informes internos privados y sincronización opcional con Firebase.

ARCHIVOS
--------
index.html
styles.css
app.js
firebase-config.js
manifest.webmanifest
service-worker.js
icon.svg
firebase.rules.json
README.txt

PIN INICIAL
-----------
1234

NOVEDADES v1.8
--------------
- Códigos cortos únicos por producto.
- Buscar productos por código o nombre en facturas, compras, pedidos, stock y productos.
- Códigos por defecto: MV, MM, CL, OK, LM, JG, etc.
- Campo Código editable en la ficha de producto.
- Prevención automática de códigos duplicados.
- El código aparece en la cuadrícula de facturas, compras y tiendas.
- El código aparece en la factura PDF cliente.
- El código aparece en reportes internos, stock, Excel y márgenes.
- Nuevo buscador de historial por código dentro de Stock.
- Al buscar un código muestra dónde se compró, a quién se vendió, qué fue a tiendas, mermas y valor sobrante.
- Pedidos WhatsApp también aceptan códigos cortos, por ejemplo: 2 MV, 5 MM, 40 CL.
- Si escribes un código exacto y sales del campo, se carga el producto automáticamente.

FUNCIONES PRINCIPALES
---------------------
- Factura cliente limpia: no muestra costes, márgenes, beneficios ni pérdidas.
- Informe interno privado con costes, márgenes, pérdidas, comisiones, transporte, stock y beneficios.
- Facturas reabribles y editables.
- Pedidos: convertir a factura, compra o compra + factura.
- Compras proveedor con precios de compra.
- Stock / almacén: sobrante por producto, valor en euros, asignación a tiendas y mermas.
- Precio recomendado de venta según coste y margen objetivo.
- Botón de precios recomendados y mínimos por cliente.
- IVA por producto y por línea.
- Factura cliente con IVA simple: arriba muestra IVA aplicado y abajo solo IVA total.
- Modo blanco por defecto y modo negro opcional.
- Panel lateral desplegable.
- Decimales con coma o punto.
- Botones +0,10 / -0,10.
- Exportación Excel.
- Backup JSON.
- Firebase opcional para ver facturas en varios dispositivos.

FIREBASE
--------
Para usar en varios dispositivos:
1. Crear proyecto Firebase.
2. Activar Authentication con email/contraseña.
3. Activar Realtime Database.
4. Pegar configuración en firebase-config.js.
5. Subir reglas firebase.rules.json.
6. Abrir Ajustes > Activar Cloud.

NOTA SOBRE PDF
--------------
No es necesario guardar PDFs en la nube. La app guarda los datos de factura y puede regenerar el PDF cuando lo necesites.


FACTURA AW v1.8 PRO FIREBASE
================================

Esta es la versión v1.8 anterior completa, pero con Firebase ya configurado.

IMPORTANTE:
- No es la versión REST v2.1.
- Mantiene el diseño, panel lateral, facturas, compras, pedidos, stock, códigos y flujo de v1.8.
- Firebase está configurado en firebase-config.js.
- La app guarda el estado completo en Realtime Database: companies/aw/state.

ARCHIVOS IMPORTANTES:
- index.html
- styles.css
- app.js
- firebase-config.js
- firebase.rules.json
- admin-setup-firebase.json

PASOS:
1. En Firebase Authentication activa Email/Password.
2. En Realtime Database > Rules pega el contenido de firebase.rules.json.
3. En Realtime Database > Data importa admin-setup-firebase.json desde la raíz.
4. Sube toda esta carpeta a GitHub Pages o Firebase Hosting.
5. Abre la app.
6. Pulsa el botón Cloud.
7. Entra con:
   Email: shaniwaris80@gmail.com
   Contraseña: la que creaste en Firebase Authentication.
8. La app leerá o escribirá en companies/aw/state.

Si no aparecen datos en otro dispositivo:
- Verifica que Cloud está activado.
- Verifica que en Realtime Database existe:
  userCompanies/8WAp56FQQHhdWG54d4RjncKPsEk2/aw = true
  companies/aw/users/8WAp56FQQHhdWG54d4RjncKPsEk2/active = true
  companies/aw/users/8WAp56FQQHhdWG54d4RjncKPsEk2/role = admin
