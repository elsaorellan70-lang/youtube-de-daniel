# NeonTube 🟢
PWA personal estilo YouTube: glassmorphism + verde neón.
Stack: HTML + CSS + JS vanilla · YouTube Data API v3 · IFrame Player API · Service Worker.

## Archivos
- index.html · styles.css · app.js  → app
- manifest.webmanifest · sw.js · icon.svg → capa PWA

## Correr local
python -m http.server 8080   (o: npx serve -l 8080 .)
Nunca abrir con file:// (Error 153 del player de YouTube).

## Clave API
Embebida en app.js (DEFAULT_KEY) por ser uso personal.
Sobreescribible desde ⚙ Ajustes (localStorage).

## Actualizar el SW
Al cambiar sw.js, incrementar `CACHE = 'neontube-shell-vN'`.

## Límites conocidos
- Anuncios: los sirve YouTube dentro del player oficial (no se quitan, ToS).
- Pantalla apagada: depende del SO/políticas del player embebido.
- Vídeos con "inserción deshabilitada" no reproducen (decisión del dueño).