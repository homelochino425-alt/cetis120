# Marcador CETis 120

Herramienta web del CETis 120 Morelia para:

- **Marcar fotos y videos** con el logo de DGETI arriba y la franja institucional abajo (cada uno se puede activar o desactivar), por lote y sin deformar nada.
- **Unir videos** con título al inicio, transición de desvanecimiento o corte directo, y música elegida por el administrador.
- **Administrar** los logos, franjas y canciones disponibles para todos, con contraseña.

Todo el procesamiento de fotos y videos ocurre en el dispositivo de cada persona; los archivos no se suben a ningún servidor. Solo los logos, franjas y canciones que agrega el administrador se guardan en Netlify.

Creado por **Ricardo Daniel Muñoz Mora «Morita»** durante su servicio social.

## Estructura

```
public/                  la página (lo que ve la gente)
  index.html             toda la aplicación
  sw.js                  permite instalarla como app
  lib/                   librerías para video y .zip (con sus licencias)
  media/                 logo y franja de fábrica
netlify/functions/api.mjs   el servidor: configuración, archivos, login y contraseña
netlify.toml             configuración de Netlify
package.json             dependencia del servidor (@netlify/blobs)
```

## Administración

- Entrar: `https://<tu-sitio>.netlify.app/#admin`
- Contraseña inicial: `Jaguares120` (cámbiala la primera vez desde el mismo panel).
- La contraseña se guarda cifrada en el servidor (PBKDF2) y cada sesión dura 12 horas.
- Lo que se agrega o quita se guarda al momento en Netlify Blobs y lo ven todos.

## Actualizar el código

Sube los archivos nuevos al repositorio de GitHub (botón **Add file › Upload files**). Netlify publica la nueva versión sola en uno o dos minutos. Los logos, franjas, canciones y la contraseña **no se pierden** al actualizar, porque viven en Netlify Blobs y no en los archivos.

## Licencias de terceros

- mp4box.js (BSD-3-Clause), mp4-muxer (MIT), JSZip (MIT o GPLv3): ver `public/lib/`.
