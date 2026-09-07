# Leaderboard Platanus Hack 2026 · WOKI

Ranking independiente de los votos públicos de Platanus Hack Bogotá 2026, con seguimiento de WOKI.

## Desarrollo

La aplicación Next.js está en `site/`. Requiere Node.js 24 LTS.

```sh
cd site
npm ci
npm run dev
```

## Verificación

```sh
cd site
npm test
npx oxlint app lib tests
npm run build
```

## Votos y sincronización

- Se consultan las páginas públicas de los 24 proyectos conocidos. El lector prefiere `props.project.voteCount` del JSON de Inertia, con respaldo en el HTML visible.
- El navegador sincroniza cada 15 segundos mientras la pestaña está visible. Las solicitudes concurrentes se agrupan y Vercel comparte una caché de 10 segundos.
- Es sincronización periódica, no un stream instantáneo. El retraso también depende de la publicación del contador por Platanus y del tiempo de red.
- La primera carga se renderiza con datos consultados en el servidor, no con un ranking congelado durante el build.
- Una lectura fallida conserva el último dato del navegador y lo marca como anterior. Si nunca hubo un dato válido se muestra `—`, nunca un cero inventado.
- Los empates comparten posición. Los deltas se calculan entre lecturas; el avance de WOKI dura la sesión de la página y se reinicia al recargar.
- Todos los proyectos abren su página oficial en otra pestaña.
- No se automatizan votos ni se solicita iniciar sesión en Platanus.

## Vercel

- Equipo: `crafter-station`
- Proyecto: `platanus`
- Repositorio: `crafter-station/leaderboard-platanus-hack-2026`
- Root Directory: `site`
- Rama de producción: `main`
- Producción: <https://platanus-2026.crafter.run/>
- Web Analytics se integra con `@vercel/analytics/next`.

El repositorio está conectado a Vercel. Cada push a `main` genera un despliegue de producción; las demás ramas generan previews. También se puede desplegar con la CLI desde `site/`.

El subdominio `platanus-2026.crafter.run` se gestiona con la CLI `crafters` (`crafters domain add`), que combina el token de Vercel del equipo con el DNS de `crafter.run` en Spaceship.

El favicon es el logo original publicado por WOKI en Platanus. `.gstack/` contiene artefactos locales de revisión y no se publica en Git.

## Identidad visual

El fondo usa doce fotografías del álbum del concurso compartido por el propietario, guardadas localmente en `site/public/event/` (718 KB en total). Son copias de resolución reducida sin hotlinks ni acceso a Google Photos desde el navegador de los visitantes. Alterna tres composiciones cada 5 segundos, con fundidos de 1,5 segundos; en móvil muestra cuatro fotos a la vez y recorre las doce. El collage es decorativo y los datos conservan superficies sólidas.

La animación espera a que las fotos estén cargadas y se pausa cuando la pestaña está oculta. Sin botón de pausa, por decisión de diseño del propietario. Con `prefers-reduced-motion` o sin JavaScript conserva la primera composición estática. Solo se anima la opacidad, sin desplazamientos ni zoom.

El motivo de radio de WOKI reproduce una recepción solo ante votos nuevos, una subida de puesto o recuperación de conexión. No simula transmisiones LoRa reales. Con movimiento reducido se conserva el texto del cambio sin animación. El indicador de actualización muestra la antigüedad de la lectura; al abrirlo explica el intervalo y la dependencia de internet del leaderboard.

Los 24 logos corresponden al directorio oficial de proyectos. Next.js los optimiza y carga progresivamente; si una imagen falla se muestran las iniciales sin cambiar el tamaño de la fila.

## Límites

No se guarda un historial permanente ni se detectan automáticamente proyectos nuevos. Si cambia el catálogo, actualizar `site/lib/projects.ts`. Si Platanus cambia su estructura de datos, las lecturas se marcarán como pendientes hasta adaptar el lector.
