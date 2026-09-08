'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { projectLogoUrl } from '@/lib/project-logos';
import { ArrowDown, ArrowUp, ArrowUpRight, Radio } from 'lucide-react';
import { SOURCE_URL, type LeaderboardData } from '@/lib/projects';
import {
  mergeSnapshot,
  rankOf,
  REFRESH_SECONDS,
  validSnapshot,
  voteChanges,
} from '@/lib/leaderboard';

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value}`;
}

function ProjectLogo({ slug, name }: { slug: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = projectLogoUrl(slug);
  return (
    <span className="project-logo" data-project={slug} aria-hidden="true">
      {(!loaded || failed || !src) && (
        <span className="logo-fallback">{name.slice(0, 2).toUpperCase()}</span>
      )}
      {src && !failed && (
        <Image
          src={src}
          alt=""
          width={44}
          height={44}
          style={{ maxWidth: 44, maxHeight: 44, objectFit: 'contain' }}
          sizes="(max-width: 640px) 32px, 44px"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export function LeaderboardClient({
  initialData,
}: {
  initialData: LeaderboardData;
}) {
  const [data, setData] = useState(initialData);
  const current = useRef(initialData);
  const [baseline, setBaseline] = useState(initialData);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const nextRefresh = useRef(0);
  const needsReconnect = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState('');
  const [offline, setOffline] = useState(false);
  const [age, setAge] = useState(0);
  const [reception, setReception] = useState<{
    id: number;
    label: string;
    rankUp: boolean;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('/api/leaderboard', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('sync');
      const incoming: unknown = await response.json();
      if (!validSnapshot(incoming)) throw new Error('invalid snapshot');
      const next = mergeSnapshot(current.current, incoming);
      const deltas = voteChanges(current.current, next);
      const oldWoki = current.current.projects.find(
        (project) => project.isWoki,
      );
      const newWoki = next.projects.find((project) => project.isWoki);
      const oldRank = oldWoki
        ? rankOf(current.current.projects, oldWoki)
        : null;
      const newRank = newWoki ? rankOf(next.projects, newWoki) : null;
      const rankUp =
        next.live &&
        current.current.live &&
        oldRank !== null &&
        newRank !== null &&
        newRank < oldRank;
      const recovered =
        needsReconnect.current &&
        next.live &&
        Date.now() - Date.parse(next.updatedAt) < 45_000;
      if ((deltas.woki ?? 0) > 0 || recovered || rankUp) {
        setReception({
          id: Date.now(),
          rankUp,
          label:
            (deltas.woki ?? 0) > 0
              ? `${signed(deltas.woki)} ${deltas.woki === 1 ? 'voto recibido' : 'votos recibidos'}`
              : recovered
                ? 'Conexión recuperada'
                : 'WOKI subió de puesto',
        });
      } else setReception(null);
      if (recovered) needsReconnect.current = false;
      setBaseline((previous) => ({
        ...previous,
        projects: previous.projects.map((original) => {
          const fresh = next.projects.find(
            (entry) => entry.slug === original.slug,
          );
          return (original.votes === null || original.stale) &&
            fresh?.votes != null &&
            !fresh.stale
            ? fresh
            : original;
        }),
      }));
      current.current = next;
      setData(next);
      // Keep each project's last movement through polls with no new votes.
      setChanges((previous) => ({ ...previous, ...deltas }));
      setError(null);
      setAge(
        Math.max(
          0,
          Math.floor((Date.now() - Date.parse(next.updatedAt)) / 1000),
        ),
      );
      const count = Object.keys(deltas).length;
      const woki = next.projects.find((project) => project.isWoki);
      setAnnouncement(
        count
          ? `${count} proyectos cambiaron. WOKI: ${woki?.votes ?? 'sin lectura'} votos, posición ${woki ? (rankOf(next.projects, woki) ?? 'pendiente') : 'pendiente'}.`
          : 'Sincronización completada. Sin cambios de votos.',
      );
    } catch {
      needsReconnect.current = true;
      if (request.current === controller)
        setError(
          'No pudimos sincronizar. Conservamos la última lectura y reintentamos en 15 segundos.',
        );
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
      nextRefresh.current = Date.now() + REFRESH_SECONDS * 1000;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const wake = () => {
      setOffline(!navigator.onLine);
      if (!navigator.onLine) needsReconnect.current = true;
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        (needsReconnect.current || Date.now() >= nextRefresh.current)
      )
        void refresh();
    };
    nextRefresh.current = Date.now() + REFRESH_SECONDS * 1000;
    const initialCheck = window.setTimeout(() => {
      setOffline(!navigator.onLine);
      if (!navigator.onLine) needsReconnect.current = true;
      setAge(
        Math.max(
          0,
          Math.floor((Date.now() - Date.parse(initialData.updatedAt)) / 1000),
        ),
      );
      if (
        navigator.onLine &&
        Date.now() - Date.parse(initialData.updatedAt) > REFRESH_SECONDS * 1000
      )
        void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      setAge(
        Math.max(
          0,
          Math.floor(
            (Date.now() - Date.parse(current.current.updatedAt)) / 1000,
          ),
        ),
      );
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (Date.now() >= nextRefresh.current) void refresh();
    }, 1000);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initialCheck);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
      const active = request.current;
      request.current = null;
      active?.abort();
    };
  }, [initialData.updatedAt, refresh]);

  const woki = data.projects.find((project) => project.isWoki);
  const wokiRank = woki ? rankOf(data.projects, woki) : null;
  const originalWoki = baseline.projects.find((project) => project.isWoki);
  const originalRank = originalWoki
    ? rankOf(baseline.projects, originalWoki)
    : null;
  const rankGain =
    wokiRank !== null && originalRank !== null ? originalRank - wokiRank : 0;
  const nextProject =
    woki?.votes != null
      ? [...data.projects]
          .reverse()
          .find(
            (project) => project.votes !== null && project.votes > woki.votes!,
          )
      : undefined;
  const gap =
    woki?.votes != null && nextProject?.votes != null
      ? nextProject.votes - woki.votes + 1
      : 0;
  const partial = !data.live || data.projects.some((project) => project.stale);
  const uncertain = partial || !!error || offline || age > 45;
  const totalVotes = data.projects.reduce(
    (sum, project) => sum + (project.votes ?? 0),
    0,
  );

  return (
    <main className="page-wrap">
      <a className="skip-link" href="#ranking-title">
        Ir al ranking
      </a>
      <header className="page-header">
        <div>
          <p className="eyebrow brand">
            <Radio size={15} aria-hidden="true" /> PLATANUS HACK [26]{' '}
            <span>· BOGOTÁ</span>
          </p>
          <h1>
            Ranking de <span>votos</span>
            <span className="title-period">.</span>
          </h1>
        </div>
        <div className="header-actions">
          <a
            className="action-button vote-link"
            href={`${SOURCE_URL}/woki`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Votar por WOKI <ArrowUpRight size={16} aria-hidden="true" />
            <span className="sr-only"> en Platanus (abre otra pestaña)</span>
          </a>
        </div>
      </header>

      <section className="woki-spotlight" aria-labelledby="woki-title">
        {reception?.rankUp && (
          <span
            key={reception.id}
            className="rank-rise-pulse"
            aria-hidden="true"
          />
        )}
        <div className="woki-identity">
          <div className="woki-heading">
            <h2 id="woki-title">
              <a
                href={`${SOURCE_URL}/woki`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WOKI <ArrowUpRight size={18} aria-hidden="true" />
                <span className="sr-only">
                  {' '}
                  en Platanus (abre otra pestaña)
                </span>
              </a>
            </h2>
            <span className="eyebrow">DESTACADO</span>
          </div>
          <p className="woki-motto">La ayuda sigue. Incluso sin internet.</p>
          <div className={`woki-transmission ${offline ? 'is-offline' : ''}`}>
            <svg
              className="signal-route"
              viewBox="0 0 156 28"
              fill="none"
              aria-hidden="true"
            >
              <path className="signal-wire" d="M8 14H126" />
              <circle className="signal-node" cx="8" cy="14" r="3" />
              <circle className="signal-node" cx="65" cy="14" r="3" />
              <path
                className="signal-antenna"
                d="M130 24V15m-3-3a3 3 0 1 0 6 0 3 3 0 0 0-6 0m-3-6a9 9 0 0 0 0 12m12-12a9 9 0 0 1 0 12m-16-16a15 15 0 0 0 0 20m20-20a15 15 0 0 1 0 20"
              />
              {reception && !offline && (
                <circle
                  key={reception.id}
                  className="signal-packet"
                  cx="8"
                  cy="14"
                  r="3"
                />
              )}
            </svg>
            <span className="signal-caption">
              {offline
                ? 'Última lectura guardada'
                : reception?.label || 'Comunicar. Conectar. Ayudar.'}
            </span>
          </div>
        </div>
        <div className="woki-metrics">
          <div className="woki-stat">
            <span className="eyebrow">
              POSICIÓN{uncertain ? ' ESTIMADA' : ''}
            </span>
            <strong
              key={wokiRank}
              className={reception?.rankUp ? 'number-change' : ''}
            >
              {wokiRank !== null ? `#${wokiRank}` : '—'}
            </strong>
            <span className="stat-note">
              {rankGain ? (
                <>
                  <span className={rankGain > 0 ? 'positive' : 'negative'}>
                    {rankGain > 0 ? '↑' : '↓'} {Math.abs(rankGain)}{' '}
                    {Math.abs(rankGain) === 1 ? 'puesto' : 'puestos'}
                  </span>
                </>
              ) : (
                `de ${data.projects.length} proyectos`
              )}
            </span>
          </div>
          {rankGain !== 0 && (
            <p className="session-caption">Desde que abriste esta página</p>
          )}
        </div>
        <div className="woki-target">
          <div className="target-heading">
            <p className="eyebrow">
              {uncertain
                ? 'LECTURA PENDIENTE'
                : nextProject
                  ? 'SIGUIENTE OBJETIVO'
                  : 'EN LA CIMA'}
            </p>
            <a
              className="text-link jump-link"
              href="#project-woki"
              onClick={() => {
                const row = document.querySelector('#project-woki .woki-row');
                row?.classList.remove('woki-located');
                requestAnimationFrame(() => {
                  requestAnimationFrame(() =>
                    row?.classList.add('woki-located'),
                  );
                });
              }}
            >
              <span>Ver WOKI en el ranking</span>{' '}
              <ArrowDown size={14} aria-hidden="true" />
            </a>
          </div>
          <p className="target-copy">
            {uncertain ? (
              'Esperando una lectura completa.'
            ) : nextProject ? (
              <>
                Faltan <strong>{gap}</strong> {gap === 1 ? 'voto' : 'votos'}{' '}
                para alcanzar el{' '}
                <strong>#{rankOf(data.projects, nextProject)}</strong>
                <span className="target-project">
                  Superar a <b>{nextProject.name}</b>
                </span>
              </>
            ) : woki?.votes != null ? (
              'WOKI comparte o lidera el primer lugar.'
            ) : (
              'Esperando votos de Platanus.'
            )}
          </p>
          {nextProject && !uncertain && (
            <div className="goal-progress">
              <progress
                className="goal-track"
                aria-label={`Votos de WOKI hacia superar a ${nextProject.name}`}
                value={woki?.votes ?? 0}
                max={(nextProject.votes ?? 0) + 1}
              />
              <span className="goal-caption">
                {woki?.votes ?? 0} / {(nextProject.votes ?? 0) + 1} votos
              </span>
            </div>
          )}
        </div>
      </section>

      {(error || offline || partial || age > 45) && (
        <output className="sync-warning">
          {offline
            ? 'Sin conexión. Mostramos la última lectura; sincronizamos al volver.'
            : error ||
              (partial
                ? 'Lectura parcial de Platanus. Los valores anteriores están marcados; el orden puede cambiar.'
                : 'La lectura tiene más de 45 segundos. Intentando obtener votos recientes.')}
        </output>
      )}
      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>

      <section className="leaderboard-shell" aria-labelledby="ranking-title">
        <div className="ranking-toolbar">
          <div>
            <h2 id="ranking-title" tabIndex={-1}>
              Proyectos
            </h2>
            <p>
              {data.projects.length} proyectos <span>·</span>{' '}
              {partial ? 'al menos ' : ''}
              {totalVotes} votos
            </p>
          </div>
          <details className="sync-status">
            <summary>
              <span
                className={`status-dot ${uncertain ? 'status-fallback' : ''}`}
              />
              <span>
                {offline
                  ? 'Sin conexión'
                  : refreshing
                    ? 'Actualizando…'
                    : uncertain
                      ? 'Lectura pendiente'
                      : age < 3
                        ? 'Actualizado ahora'
                        : `Actualizado hace ${age} s`}
              </span>
            </summary>
            <p className="sync-explanation">
              Consultamos los votos públicos cada 15 segundos. El leaderboard
              necesita internet para recibir cambios; WOKI puede operar sin
              internet.
            </p>
          </details>
        </div>
        <div className="ranking-columns" aria-hidden="true">
          <span>#</span>
          <span>Proyecto</span>
          <span>Track</span>
          <span>Votos</span>
          <span />
        </div>
        <ol className="ranking-list">
          {data.projects.map((project) => {
            const rank = rankOf(data.projects, project);
            const delta = changes[project.slug];
            const tied =
              project.votes !== null &&
              data.projects.filter((entry) => entry.votes === project.votes)
                .length > 1;
            return (
              <li key={project.slug} id={`project-${project.slug}`}>
                <a
                  className={`project-row ${project.isWoki ? 'woki-row' : ''}`}
                  href={`${SOURCE_URL}/${project.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${project.name}, ${rank !== null ? `posición ${rank}${tied ? ' compartida' : ''}` : 'posición pendiente'}, ${project.votes ?? 'sin lectura de'} votos${project.stale ? ', lectura anterior' : delta ? `, último cambio: ${signed(delta)} votos` : ''}. Abrir en Platanus en otra pestaña.`}
                >
                  <span
                    className={`rank ${rank && rank <= 3 ? `podium-${rank}` : ''}`}
                  >
                    {rank ?? '—'}
                  </span>
                  <span className="project-info">
                    <ProjectLogo slug={project.slug} name={project.name} />
                    <span className="project-name">
                      {project.name}
                      {project.isWoki && (
                        <span className="woki-badge">
                          <Image
                            src="/crafter-station-icon-light.webp"
                            alt=""
                            width={12}
                            height={12}
                            className="crafter-team-icon"
                          />
                          CRAFTER TEAM
                        </span>
                      )}
                    </span>
                    <span className="project-summary">{project.summary}</span>
                    <span className="mobile-track">{project.track}</span>
                  </span>
                  <span className="track-badge">{project.track}</span>
                  <span className="vote-cell">
                    <span
                      key={`${project.slug}-${project.votes}`}
                      className={`vote-count ${delta ? 'number-change' : ''}`}
                    >
                      {project.votes ?? '—'}
                    </span>
                    <span
                      className={`vote-detail ${project.stale ? 'stale-count' : delta && delta < 0 ? 'negative' : 'positive'}`}
                      title={
                        !project.stale && delta
                          ? `Último cambio: ${signed(delta)} votos`
                          : undefined
                      }
                    >
                      {project.stale ? (
                        'anterior'
                      ) : delta ? (
                        <>
                          {delta > 0 ? (
                            <ArrowUp size={12} aria-hidden="true" />
                          ) : (
                            <ArrowDown size={12} aria-hidden="true" />
                          )}
                          {signed(delta)}
                        </>
                      ) : (
                        ''
                      )}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="row-arrow"
                    size={16}
                    aria-hidden="true"
                  />
                </a>
              </li>
            );
          })}
        </ol>
      </section>
      <footer>
        <p>
          Los empates comparten posición. Los cambios se comparan con la lectura
          anterior.
        </p>
        <p>Votos públicos de Platanus · Sitio independiente, no oficial.</p>
      </footer>
    </main>
  );
}
