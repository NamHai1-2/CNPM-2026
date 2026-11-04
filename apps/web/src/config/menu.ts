export interface MenuItem {
  title: string;
  path: string;
  roles: Array<'ADMIN' | 'MERCHANT_OWNER' | 'STAFF'>;
}

export const NAV_ITEMS: MenuItem[] = [
  { title: 'Admin Dashboard', path: '/admin/dashboard', roles: ['ADMIN'] },
  { title: 'Quản lý Merchant', path: '/admin/merchants', roles: ['ADMIN'] },
  { title: 'System Ledger Logs', path: '/admin/logs', roles: ['ADMIN'] },
  { title: 'Cửa hàng của tôi', path: '/merchant/dashboard', roles: ['MERCHANT_OWNER', 'STAFF'] },
  { title: 'Cài đặt tài khoản', path: '/settings', roles: ['ADMIN', 'MERCHANT_OWNER', 'STAFF'] },
];

export function getMenuForRole(role?: string): MenuItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role as any));
}