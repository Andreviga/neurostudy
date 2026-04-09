'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Cloud, CheckCircle2, Loader2, Unlink, Link2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { cloudApi } from '@/lib/api';
import type { CloudConnection } from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Provider definitions ─────────────────────────────────────────────────────

const PROVIDERS = [
  {
    key: 'google' as const,
    dbKey: 'GOOGLE_DRIVE' as const,
    label: 'Google Drive',
    description:
      'Arquivos ficam na sua conta do Google — a pasta "NeuroStudy" é criada automaticamente.',
    steps: [
      'Clique em "Conectar"',
      'Faça login na sua conta Google',
      'Autorize o acesso à pasta NeuroStudy',
    ],
    borderActive: 'border-yellow-300',
    bgActive: 'bg-yellow-50',
    badge: 'bg-yellow-100 text-yellow-800',
    Icon: () => (
      <svg viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
      </svg>
    ),
  },
  {
    key: 'onedrive' as const,
    dbKey: 'ONE_DRIVE' as const,
    label: 'OneDrive',
    description:
      'Arquivos ficam na pasta "Apps/NeuroStudy" do seu OneDrive pessoal ou corporativo.',
    steps: [
      'Clique em "Conectar"',
      'Entre com sua conta Microsoft',
      'Autorize o acesso à pasta do app',
    ],
    borderActive: 'border-blue-300',
    bgActive: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-800',
    Icon: () => (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
        <path d="M10.5 14.5H20l-3.7-6.4a6 6 0 0 0-10.3 3 4 4 0 0 1 4.5 3.4z" fill="#0364b8" />
        <path d="M6.3 11.1a4 4 0 0 0-.3 1.4 4 4 0 0 0 4 4h10a2 2 0 0 0 2-2H10.5a4 4 0 0 1-4.2-3.4z" fill="#0078d4" />
        <path d="M6.3 11.1A4 4 0 0 0 2 15a4 4 0 0 0 4 4h14a2 2 0 0 0 2-2v-.5H10.5a4 4 0 0 1-4.2-5.4z" fill="#1490df" />
      </svg>
    ),
  },
] as const;

// ─── Inner component (uses useSearchParams — must be inside Suspense) ─────────

function SettingsContent() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    cloudApi.status().then(setConnections).finally(() => setLoading(false));
  }, []);

  // Handle OAuth redirect back to this page
  useEffect(() => {
    const connected = searchParams.get('cloud_connected');
    const error = searchParams.get('cloud_error');
    if (connected) {
      const label = PROVIDERS.find((p) => p.key === connected)?.label ?? connected;
      toast.success(`${label} conectado com sucesso!`);
      cloudApi.status().then(setConnections);
      window.history.replaceState({}, '', '/settings');
    }
    if (error) {
      const msg = decodeURIComponent(error);
      if (msg === 'access_denied') {
        toast('Conexão cancelada.', { icon: 'ℹ️' });
      } else {
        toast.error(`Erro ao conectar: ${msg}`);
      }
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams]);

  async function connect(provider: 'google' | 'onedrive') {
    setConnecting(provider);
    try {
      const { authUrl } = await cloudApi.getAuthUrl(provider);
      window.location.href = authUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao iniciar conexão';
      if (msg.includes('not configured')) {
        toast.error('Este provedor ainda não foi configurado pelo administrador.');
      } else {
        toast.error(msg);
      }
      setConnecting(null);
    }
  }

  async function disconnect(provider: 'google' | 'onedrive') {
    setDisconnecting(provider);
    try {
      await cloudApi.disconnect(provider);
      setConnections((prev) =>
        prev.filter((c) => c.provider !== PROVIDERS.find((p) => p.key === provider)?.dbKey)
      );
      toast.success('Drive desconectado. Novos uploads voltarão ao armazenamento padrão.');
    } catch {
      toast.error('Erro ao desconectar.');
    } finally {
      setDisconnecting(null);
    }
  }

  function connectionFor(dbKey: string): CloudConnection | undefined {
    return connections.find((c) => c.provider === dbKey);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        <p className="text-slate-500 text-sm mt-0.5">Gerencie integrações da sua conta.</p>
      </div>

      {/* ─── Cloud Storage ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-slate-800">Seu armazenamento na nuvem</h2>
        </div>

        {/* Info banner */}
        <div className="flex gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
          <Info className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
          <div>
            Conecte o seu <strong>Google Drive</strong> ou <strong>OneDrive</strong>.
            Os arquivos enviados nas disciplinas ficam <strong>na sua conta</strong> — o
            NeuroStudy guarda apenas o ID e o link de visualização, sem ocupar espaço no servidor.
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Verificando conexões...
          </div>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map((p) => {
              const conn = connectionFor(p.dbKey);
              const isConn = Boolean(conn);

              return (
                <div
                  key={p.key}
                  className={cn(
                    'rounded-2xl border-2 p-4 transition-all',
                    isConn ? `${p.borderActive} ${p.bgActive}` : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Provider icon */}
                    <div className="mt-0.5 flex-shrink-0">
                      <p.Icon />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900">{p.label}</span>
                        {isConn && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5',
                              p.badge
                            )}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Conectado
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{p.description}</p>

                      {/* How-to steps (only when not connected) */}
                      {!isConn && (
                        <ol className="mt-3 space-y-1">
                          {p.steps.map((step, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                              <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                {i + 1}
                              </span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      )}

                      {/* Connected since */}
                      {conn && (
                        <p className="mt-2 text-xs text-slate-400">
                          Conectado em{' '}
                          {new Date(conn.createdAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="flex-shrink-0 mt-0.5">
                      {isConn ? (
                        <button
                          onClick={() => disconnect(p.key)}
                          disabled={disconnecting === p.key}
                          className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50 whitespace-nowrap"
                        >
                          {disconnecting === p.key ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unlink className="w-4 h-4" />
                          )}
                          Desconectar
                        </button>
                      ) : (
                        <button
                          onClick={() => connect(p.key)}
                          disabled={connecting === p.key}
                          className="flex items-center gap-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl px-4 py-2 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {connecting === p.key ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                          {connecting === p.key ? 'Abrindo...' : 'Conectar'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Priority note when both connected */}
        {connections.length > 1 && (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Com dois drives conectados, o Google Drive tem prioridade nos uploads.
          </p>
        )}
      </section>
    </div>
  );
}

// ─── Page export — wraps with Suspense (required by Next.js for useSearchParams) ─

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-slate-400 gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando configurações...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
