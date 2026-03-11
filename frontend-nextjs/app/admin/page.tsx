'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import AdminPanel from '../components/AdminPanel';

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'superadmin')) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'superadmin') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--main-bg)' }}>
        <div className="animate-spin w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  return <AdminPanel />;
}
