import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import type { ApiKey } from '../../types/merchant.js';

export const ApiKeyManager: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keyName, setKeyName] = useState<string>('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleCreateKey = async () => {
    if (!keyName || loading) return;
    setLoading(true);
    try {
      const res = await apiFetch<ApiKey>('/merchant/api-keys', {
        method: 'POST',
        data: { name: keyName },
      });
      setKeys((prev) => [...prev, res]);
      if (res.secret) {
        setCreatedSecret(res.secret);
      }
      setKeyName('');
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Quản lý Khóa API</h2>
      {createdSecret && (
        <div className="secret-alert">
          <p><strong>Lưu ý quan trọng:</strong> Khóa bí mật chỉ hiển thị 1 lần duy nhất!</p>
          <code>{createdSecret}</code>
          <button onClick={() => setCreatedSecret(null)}>Đã sao chép & đóng</button>
        </div>
      )}
      <div>
        <input
          type="text"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="Tên khóa API"
          disabled={loading}
        />
        <button onClick={handleCreateKey} disabled={loading || !keyName}>
          Tạo Khóa API
        </button>
      </div>
      <ul>
        {keys.map((k) => (
          <li key={k.id}>{k.name} - {k.maskedKey}</li>
        ))}
      </ul>
    </div>
  );
};