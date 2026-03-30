'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Brain } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '@/lib/api';
import { saveSession } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', course: '', semester: '' });
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user } = await authApi.signup({
        name: form.name,
        email: form.email,
        password: form.password,
        course: form.course || undefined,
        semester: form.semester ? parseInt(form.semester) : undefined,
      });
      saveSession(token, user);
      toast.success('Conta criada! Bem-vindo ao NeuroStudy.');
      router.push('/dashboard');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900">NeuroStudy</span>
          </Link>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Criar conta grátis</h1>
          <p className="text-slate-500 text-sm mb-7">
            Já tem conta?{' '}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">Entrar</Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome completo</label>
              <input className="input" placeholder="Ana Oliveira" value={form.name} onChange={set('name')} required autoFocus />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
              <input type="email" className="input" placeholder="você@uni.edu.br" value={form.email} onChange={set('email')} required />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
              <input type="password" className="input" placeholder="Mínimo 6 caracteres" value={form.password} onChange={set('password')} minLength={6} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Curso (opcional)</label>
                <input className="input" placeholder="Eng. de Computação" value={form.course} onChange={set('course')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Semestre</label>
                <select className="input" value={form.semester} onChange={set('semester')}>
                  <option value="">Selecionar</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}º semestre</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full py-3 mt-2" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
