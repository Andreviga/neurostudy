const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ns_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('ns_token');
    window.location.href = '/login';
    throw new Error('Unauthenticated');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  signup: (data: { name: string; email: string; password: string; course?: string; semester?: number }) =>
    request<{ token: string; user: import('@/types').User }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: import('@/types').User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<import('@/types').User>('/api/auth/me'),
};

// ─── Subjects ─────────────────────────────────────────────────────────────────
export const subjectsApi = {
  list: () => request<import('@/types').Subject[]>('/api/subjects'),
  get: (id: string) => request<import('@/types').Subject>(`/api/subjects/${id}`),
  create: (data: Partial<import('@/types').Subject>) =>
    request<import('@/types').Subject>('/api/subjects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<import('@/types').Subject>) =>
    request<import('@/types').Subject>(`/api/subjects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/api/subjects/${id}`, { method: 'DELETE' }),
};

// ─── Materials ────────────────────────────────────────────────────────────────
export const materialsApi = {
  upload: async (subjectId: string, file: File, title?: string) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    form.append('subjectId', subjectId);
    if (title) form.append('title', title);

    const res = await fetch(`${API_BASE}/api/materials/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
    return res.json() as Promise<import('@/types').Material>;
  },
  pasteText: (data: { subjectId: string; title: string; text: string }) =>
    request<import('@/types').Material>('/api/materials/text', { method: 'POST', body: JSON.stringify(data) }),
  url: (data: { subjectId: string; url: string; title?: string }) =>
    request<import('@/types').Material>('/api/materials/url', { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) => request<import('@/types').Material>(`/api/materials/${id}`),
};

// ─── Topics ───────────────────────────────────────────────────────────────────
export const topicsApi = {
  list: (subjectId?: string) =>
    request<import('@/types').Topic[]>(`/api/topics${subjectId ? `?subjectId=${subjectId}` : ''}`),
  get: (id: string) => request<import('@/types').Topic>(`/api/topics/${id}`),
  generate: (id: string, format: import('@/types').StudyFormat, provider?: string) =>
    request<import('@/types').GeneratedContent>(`/api/topics/${id}/generate`, {
      method: 'POST',
      body: JSON.stringify({ format, provider }),
    }),
};

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessionsApi = {
  record: (data: Partial<import('@/types').StudySession>) =>
    request<import('@/types').StudySession>('/api/sessions', { method: 'POST', body: JSON.stringify(data) }),
  list: (limit?: number) =>
    request<import('@/types').StudySession[]>(`/api/sessions${limit ? `?limit=${limit}` : ''}`),
  stats: () => request<import('@/types').SessionStats>('/api/sessions/stats'),
};

// ─── Reviews ──────────────────────────────────────────────────────────────────
export const reviewsApi = {
  due: () => request<import('@/types').Review[]>('/api/reviews/due'),
  all: () => request<import('@/types').Review[]>('/api/reviews'),
};

// ─── Profile ──────────────────────────────────────────────────────────────────
export const profileApi = {
  get: () => request<import('@/types').LearningProfile>('/api/profile'),
  today: () => request<import('@/types').TodayPlan>('/api/profile/today'),
};
