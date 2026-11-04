export interface ApiOptions extends RequestInit {
  data?: unknown;
}

export async function apiFetch<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`/api/v1${endpoint}`, {
    ...options,
    headers,
    body: options.data ? JSON.stringify(options.data) : options.body,
  });

  const resData = await response.json().catch(() => ({}));

  if (!response.ok || resData.error) {
    const errorCode = resData.code || resData.message || resData.error;

    // Khi hết phiên làm việc hoặc bị trả về MSG35 -> Tự động xoá token và chuyển về Login
    if (errorCode === 'MSG35' || response.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login?msg=MSG35';
      }
    }
    throw new Error(errorCode || 'API_ERROR');
  }

  return resData as T;
}