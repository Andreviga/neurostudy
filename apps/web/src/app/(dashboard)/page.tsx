import { redirect } from 'next/navigation';

// /dashboard is the canonical URL, redirect root of (dashboard) group there
export default function DashboardRoot() {
  redirect('/dashboard');
}
