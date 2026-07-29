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


V1.9 PEDIDOS FULL
-----------------
Pedidos ahora incluye:
- Validación de pedido.
- Guardado y reapertura de pedidos.
- Abrir, duplicar, eliminar pedidos.
- Convertir pedido guardado a factura, compra, ambas o tienda propia.
- Estados ampliados: borrador, revisado, con faltas, compra, factura, convertido y cerrado.
- Resumen de faltantes, venta estimada y disponibilidad en listado.
