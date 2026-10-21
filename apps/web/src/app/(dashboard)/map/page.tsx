'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, Map as MapIcon } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface GraphNode {
  id: string;
  title: string;
  difficulty: string;
  prerequisites: string[];
  subjectId: string;
  subjectName: string;
  color: string;
  studied: boolean;
  mastered: boolean;
}

interface Positioned extends GraphNode {
  x: number;
  y: number;
  level: number;
}

const NODE_W = 190;
const NODE_H = 26;
const COL_GAP = 110;
const ROW_GAP = 10;

/** Longest-path-from-roots level for each node (iterative, cycle-safe) */
function computeLevels(nodes: GraphNode[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const level = new Map<string, number>();
  nodes.forEach((n) => level.set(n.id, 0));
  for (let pass = 0; pass < 25; pass++) {
    let changed = false;
    for (const n of nodes) {
      const prereqLevels = n.prerequisites.filter((p) => ids.has(p)).map((p) => level.get(p) ?? 0);
      const want = prereqLevels.length ? Math.max(...prereqLevels) + 1 : 0;
      if (want > (level.get(n.id) ?? 0)) { level.set(n.id, want); changed = true; }
    }
    if (!changed) break;
  }
  return level;
}

export default function KnowledgeMapPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<Positioned | null>(null);

  const view = useRef({ x: 40, y: 40, scale: 0.8 });
  const dragging = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('ns_token');
    fetch(`${API}/api/topics/graph`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json())
      .then((d) => setNodes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const subjects = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    nodes.forEach((n) => m.set(n.subjectId, { name: n.subjectName, color: n.color }));
    return [...m.entries()].map(([id, v]) => ({ id, ...v }));
  }, [nodes]);

  // Layout: levels → columns; rows sorted to cluster subjects
  const positioned = useMemo<Positioned[]>(() => {
    const visible = subjectFilter === 'all' ? nodes : nodes.filter((n) => n.subjectId === subjectFilter);
    const levels = computeLevels(visible);
    const byLevel = new Map<number, GraphNode[]>();
    for (const n of visible) {
      const l = levels.get(n.id) ?? 0;
      if (!byLevel.has(l)) byLevel.set(l, []);
      byLevel.get(l)!.push(n);
    }
    const out: Positioned[] = [];
    for (const [l, group] of byLevel) {
      group.sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.title.localeCompare(b.title));
      group.forEach((n, i) => {
        out.push({ ...n, level: l, x: l * (NODE_W + COL_GAP), y: i * (NODE_H + ROW_GAP) });
      });
    }
    return out;
  }, [nodes, subjectFilter]);

  const posById = useMemo(() => new Map(positioned.map((p) => [p.id, p])), [positioned]);
  const normalizedQuery = query.trim().toLowerCase();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.current.x, view.current.y);
    ctx.scale(view.current.scale, view.current.scale);

    const matches = (n: GraphNode) => !normalizedQuery || n.title.toLowerCase().includes(normalizedQuery);

    // Edges
    ctx.lineWidth = 1;
    for (const n of positioned) {
      for (const p of n.prerequisites) {
        const from = posById.get(p);
        if (!from) continue;
        const dim = normalizedQuery && !(matches(n) || matches(from));
        ctx.strokeStyle = dim ? 'rgba(148,163,184,0.08)' : hovered && (hovered.id === n.id || hovered.id === from.id) ? '#6366f1' : 'rgba(148,163,184,0.35)';
        ctx.beginPath();
        const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
        const x2 = n.x, y2 = n.y + NODE_H / 2;
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1 + COL_GAP / 2, y1, x2 - COL_GAP / 2, y2, x2, y2);
        ctx.stroke();
      }
    }

    // Nodes
    ctx.font = '11px system-ui, sans-serif';
    for (const n of positioned) {
      const dim = normalizedQuery && !matches(n);
      ctx.globalAlpha = dim ? 0.15 : 1;
      ctx.beginPath();
      ctx.roundRect(n.x, n.y, NODE_W, NODE_H, 7);
      ctx.fillStyle = n.mastered ? n.color : n.studied ? `${n.color}55` : '#ffffff';
      ctx.fill();
      ctx.lineWidth = hovered?.id === n.id ? 2.5 : 1.2;
      ctx.strokeStyle = n.color;
      ctx.stroke();
      ctx.fillStyle = n.mastered ? '#ffffff' : '#334155';
      const label = n.title.length > 30 ? n.title.slice(0, 29) + '…' : n.title;
      ctx.fillText(label, n.x + 8, n.y + 17);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }, [positioned, posById, hovered, normalizedQuery]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  function toWorld(e: React.MouseEvent | React.WheelEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    return {
      x: (sx - view.current.x) / view.current.scale,
      y: (sy - view.current.y) / view.current.scale,
      sx, sy,
    };
  }

  function hitTest(wx: number, wy: number): Positioned | null {
    for (const n of positioned) {
      if (wx >= n.x && wx <= n.x + NODE_W && wy >= n.y && wy <= n.y + NODE_H) return n;
    }
    return null;
  }

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col">
      <div className="p-4 sm:p-6 pb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-brand-600" />
          Mapa do Conhecimento
        </h1>
        <span className="text-xs text-slate-400">
          {positioned.length} tópicos · setas = pré-requisitos · clique para estudar
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className="input pl-8 py-1.5 text-xs w-48"
              placeholder="Buscar tópico..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="input py-1.5 text-xs w-44"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="all">Todas as disciplinas</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 sm:px-6 pb-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-brand-500 bg-white inline-block" /> não estudado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-brand-500 bg-brand-200 inline-block" /> estudado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-500 inline-block" /> dominado (≥60%)</span>
        <span className="text-slate-400">· arraste para mover · scroll para zoom</span>
      </div>

      <div className="flex-1 relative mx-4 sm:mx-6 mb-4 card overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando o mapa...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ cursor: hovered ? 'pointer' : dragging.current ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => {
              dragging.current = { startX: e.clientX, startY: e.clientY, viewX: view.current.x, viewY: view.current.y };
            }}
            onMouseMove={(e) => {
              if (dragging.current) {
                view.current.x = dragging.current.viewX + (e.clientX - dragging.current.startX);
                view.current.y = dragging.current.viewY + (e.clientY - dragging.current.startY);
                draw();
                return;
              }
              const { x, y } = toWorld(e);
              const hit = hitTest(x, y);
              if (hit?.id !== hovered?.id) setHovered(hit);
            }}
            onMouseUp={(e) => {
              const wasDrag = dragging.current &&
                (Math.abs(e.clientX - dragging.current.startX) > 4 || Math.abs(e.clientY - dragging.current.startY) > 4);
              dragging.current = null;
              if (!wasDrag) {
                const { x, y } = toWorld(e);
                const hit = hitTest(x, y);
                if (hit) router.push(`/study/${hit.id}`);
              }
            }}
            onMouseLeave={() => { dragging.current = null; setHovered(null); }}
            onWheel={(e) => {
              const { sx, sy } = toWorld(e);
              const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
              const newScale = Math.min(2.5, Math.max(0.12, view.current.scale * factor));
              // zoom around cursor
              view.current.x = sx - ((sx - view.current.x) / view.current.scale) * newScale;
              view.current.y = sy - ((sy - view.current.y) / view.current.scale) * newScale;
              view.current.scale = newScale;
              draw();
            }}
          />
        )}

        {hovered && (
          <div className="absolute bottom-3 left-3 card px-3 py-2 text-xs shadow-md max-w-sm pointer-events-none bg-white/95">
            <p className="font-semibold text-slate-900">{hovered.title}</p>
            <p className="text-slate-400 mt-0.5">
              {hovered.subjectName} · nível {hovered.level} · {hovered.prerequisites.length} pré-requisito(s)
              {hovered.mastered ? ' · ✅ dominado' : hovered.studied ? ' · 📖 estudado' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
