'use client';
import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { subjectsApi, materialsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Subject } from '@/types';

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function UploadPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [textForm, setTextForm] = useState({ title: '', text: '' });
  const [textLoading, setTextLoading] = useState(false);

  useEffect(() => {
    subjectsApi.list().then((list) => {
      setSubjects(list);
      if (list.length > 0) setSelectedSubject(list[0].id);
    });
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    const items: UploadItem[] = accepted.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      status: 'pending',
    }));
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'text/plain': ['.txt'] },
    maxSize: 50 * 1024 * 1024,
  });

  async function uploadAll() {
    if (!selectedSubject) { toast.error('Selecione uma disciplina'); return; }
    const pending = queue.filter((q) => q.status === 'pending');
    if (pending.length === 0) { toast.error('Nenhum arquivo pendente'); return; }

    for (const item of pending) {
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'uploading' } : q));
      try {
        await materialsApi.upload(selectedSubject, item.file);
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'success' } : q));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro no upload';
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'error', error: msg } : q));
      }
    }
    toast.success('Upload concluído! Os tópicos serão gerados em instantes.');
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSubject) { toast.error('Selecione uma disciplina'); return; }
    setTextLoading(true);
    try {
      await materialsApi.pasteText({ subjectId: selectedSubject, ...textForm });
      toast.success('Texto enviado! Tópicos serão gerados em breve.');
      setTextForm({ title: '', text: '' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar texto');
    } finally {
      setTextLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Upload de material</h1>
        <p className="text-slate-500 text-sm mt-0.5">Envie PDFs ou cole texto — a IA extrai os tópicos automaticamente</p>
      </div>

      {/* Subject selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Disciplina *</label>
        {subjects.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
            Crie uma disciplina primeiro em{' '}
            <a href="/subjects" className="font-semibold hover:underline">Disciplinas</a>
          </div>
        ) : (
          <select className="input" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(['file', 'text'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t === 'file' ? '📄 Arquivo' : '📝 Texto'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'file' ? (
          <motion.div key="file" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all',
                isDragActive ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
              )}
            >
              <input {...getInputProps()} />
              <Upload className={cn('w-10 h-10 mx-auto mb-3', isDragActive ? 'text-brand-500' : 'text-slate-300')} />
              <p className="text-sm font-medium text-slate-700">
                {isDragActive ? 'Solte aqui!' : 'Arraste arquivos ou clique para selecionar'}
              </p>
              <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT — até 50 MB</p>
            </div>

            {/* Queue */}
            {queue.length > 0 && (
              <div className="space-y-2">
                {queue.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 card">
                    <FileText className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.file.name}</p>
                      <p className="text-xs text-slate-400">{(item.file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />}
                    {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {item.status === 'error' && (
                      <span title={item.error}>
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <button onClick={() => setQueue((prev) => prev.filter((q) => q.id !== item.id))} className="text-slate-300 hover:text-slate-500">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={uploadAll}
                  disabled={queue.every((q) => q.status !== 'pending')}
                  className="btn-primary w-full py-3"
                >
                  <Upload className="w-4 h-4" />
                  Enviar {queue.filter((q) => q.status === 'pending').length} arquivo(s)
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="text" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <form onSubmit={submitText} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Título</label>
                <input
                  className="input"
                  placeholder="Ex: Anotações Aula 3 — Integrais"
                  value={textForm.title}
                  onChange={(e) => setTextForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Conteúdo <span className="text-slate-400 font-normal">({textForm.text.length} chars)</span>
                </label>
                <textarea
                  className="input min-h-[220px] resize-y"
                  placeholder="Cole aqui o texto do material, notas de aula, transcrição..."
                  value={textForm.text}
                  onChange={(e) => setTextForm((f) => ({ ...f, text: e.target.value }))}
                  required
                  minLength={100}
                />
              </div>
              <button type="submit" className="btn-primary w-full py-3" disabled={textLoading}>
                {textLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {textLoading ? 'Processando...' : 'Enviar texto'}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
