# Sobtree — web de servicios IA × Salesforce

Sitio estático (HTML, CSS y JS sin dependencias ni build). Se sube tal cual a Hostinger.

## Estructura

```
index.html          Página única
contact.php         Envío del formulario por email (Hostinger)
privacidad.html     Privacidad y aviso legal
assets/styles.css   Estilos
assets/main.js      Casos de uso, calculadora ROI, autodiagnóstico, menú y formulario
assets/favicon.svg  Icono
.htaccess           HTTPS, caché y cabeceras (Apache/Hostinger)
robots.txt, sitemap.xml
.github/workflows/deploy.yml   Despliegue automático por FTP (opcional)
```

## Ver en local

Abre `index.html` en el navegador. No necesita servidor.

## Publicar en Hostinger

**Opción A — Git nativo de Hostinger (recomendada).**
hPanel → Avanzado → Git → conecta este repositorio, rama `main`, directorio `public_html`.
Activa el despliegue automático y copia la URL del webhook en GitHub (Settings → Webhooks).
Cada push a `main` se publica solo.

**Opción B — GitHub Actions por FTP.**
1. Crea los secretos `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (Settings → Secrets and variables → Actions).
2. Crea la variable `DEPLOY_ENABLED` con valor `true` (misma pantalla, pestaña Variables).
3. Cada push a `main` sube los ficheros a `public_html/`.

**Opción C — manual.** Sube todo menos `.github/` y `README.md` a `public_html/` desde el gestor de archivos.

## Antes de publicar

- Dominio: `index.html` (canonical, og:url), `robots.txt` y `sitemap.xml` apuntan a `https://sobtree.com/`. Cámbialo si va en otro dominio o subdominio.
- Formulario: `contact.php` envía cada solicitud a `info@sobtree.com` con `mail()` de Hostinger. Crea en hPanel el buzón `web@sobtree.com` (remitente) o cambia `$from` en el PHP. Abriendo la web en local, el formulario cae al correo del visitante.
- `privacidad.html`: texto base de privacidad y aviso legal. Revísalo con tu asesor antes de publicar.
- Revisa la compatibilidad con tu contrato laboral actual antes de hacer pública la web.
