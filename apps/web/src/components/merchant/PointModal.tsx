import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { generateIdempotencyKey } from '../../lib/idempotency.js';

interface PointModalProps {
  customerId: string;
  type: 'EARN' | 'REDEEM';
  onSuccess: () => void;
  onClose: () => void;
}

export const PointModal: React.FC<PointModalProps> = ({ customerId, type, onSuccess, onClose }) => {
  const [points, setPoints] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async () => {
    if (loading || points <= 0) return;
    setLoading(true);
    setError('');

    const idempotencyKey = generateIdempotencyKey();

    try {
      await apiFetch(`/merchant/customers/${customerId}/points`, {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
        data: { type, points },
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'TRANSACTION_FAILED';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{type === 'EARN' ? 'Cộng điểm' : 'Đổi điểm'}</h3>
        <input
          type="number"
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          disabled={loading}
        />
        {error && <p className="error">{error}</p>}
        <button onClick={handleSubmit} disabled={loading || points <= 0}>
          {loading ? 'Đang xử lý...' : 'Xác nhận'}
        </button>
        <button onClick={onClose} disabled={loading}>
          Hủy
        </button>
      </div>
    </div>
  );
};