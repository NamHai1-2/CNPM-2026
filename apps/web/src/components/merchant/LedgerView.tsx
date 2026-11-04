import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import type { LedgerEntry, UserRole } from '../../types/merchant.js';

interface LedgerViewProps {
  role: UserRole;
  entries: LedgerEntry[];
  onRefresh: () => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({ role, entries, onRefresh }) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    if (role !== 'MERCHANT_OWNER') return;
    setCancellingId(id);
    try {
      await apiFetch(`/merchant/ledger/${id}/cancel`, { method: 'POST' });
      onRefresh();
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <table>
      <thead>
        <tr>
          <th>Mã giao dịch</th>
          <th>Hash</th>
          <th>Số điểm</th>
          <th>Trạng thái</th>
          {role === 'MERCHANT_OWNER' && <th>Thao tác</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td>{entry.id}</td>
            <td>{entry.txHash}</td>
            <td>{entry.amount}</td>
            <td>
              <span className={`status-${entry.status.toLowerCase()}`}>
                {entry.status}
              </span>
            </td>
            {role === 'MERCHANT_OWNER' && (
              <td>
                {entry.status === 'PENDING_ANCHOR' && (
                  <button
                    onClick={() => handleCancel(entry.id)}
                    disabled={cancellingId === entry.id}
                  >
                    Hủy
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
};