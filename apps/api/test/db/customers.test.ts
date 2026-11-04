import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  createCustomer,
  searchCustomers,
  updateCustomer,
  toggleLockCustomer,
} from '../../src/services/customers.js';

describe('T05 - Customer Management Services', () => {
  let db: TestDatabase;
  let sql: Sql;
  let merchantAId: string;
  let merchantBId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;

    const [m1] = await sql`
      INSERT INTO merchants (code, name, status) VALUES ('MCH-A', 'Store A', 'ACTIVE') RETURNING id
    `;
    const [m2] = await sql`
      INSERT INTO merchants (code, name, status) VALUES ('MCH-B', 'Store B', 'ACTIVE') RETURNING id
    `;
    merchantAId = m1.id;
    merchantBId = m2.id;
  });

  afterAll(async () => {
    if (sql) {
      await sql.end().catch(() => undefined);
    }
    if (db) {
      await db.drop().catch(() => undefined);
    }
  });

  it('tạo khách hàng thành công khi mã viết hoa', async () => {
    const customer = await createCustomer(sql, merchantAId, {
      code: 'CUST001',
      name: 'Nguyen Van A',
      phone: '0901234567',
    });
    expect(customer.code).toBe('CUST001');
    expect(customer.name).toBe('Nguyen Van A');
  });

  it('từ chối mã có chứa chữ thường', async () => {
    await expect(
      createCustomer(sql, merchantAId, {
        code: 'cust002',
        name: 'Nguyen Van B',
      })
    ).rejects.toThrow();
  });

  it('báo lỗi MSG27 khi trùng mã khách hàng', async () => {
    await expect(
      createCustomer(sql, merchantAId, {
        code: 'CUST001',
        name: 'Nguyen Van C',
      })
    ).rejects.toThrow('MSG27');
  });

  it('báo lỗi MSG38 khi trùng SĐT trong cùng cửa hàng', async () => {
    await expect(
      createCustomer(sql, merchantAId, {
        code: 'CUST003',
        name: 'Nguyen Van D',
        phone: '0901234567',
      })
    ).rejects.toThrow('MSG38');
  });

  it('cho phép trùng SĐT ở hai cửa hàng khác nhau', async () => {
    const customerB = await createCustomer(sql, merchantBId, {
      code: 'CUST001',
      name: 'Tran Van E',
      phone: '0901234567',
    });
    expect(customerB.phone).toBe('0901234567');
  });

  it('tìm kiếm khách hàng theo mã, tên hoặc SĐT', async () => {
    const results = await searchCustomers(sql, merchantAId, 'CUST001');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Nguyen Van A');
  });

  it('chỉ sửa được tên và số điện thoại', async () => {
    const list = await searchCustomers(sql, merchantAId, 'CUST001');
    const customerId = list[0].id;

    const updated = await updateCustomer(sql, merchantAId, customerId, {
      name: 'Nguyen Van A Updated',
      phone: '0909999999',
    });
    expect(updated.name).toBe('Nguyen Van A Updated');
    expect(updated.phone).toBe('0909999999');
  });

  it('báo lỗi MSG04 khi nhân viên (STAFF) thực hiện khóa khách hàng', async () => {
    const list = await searchCustomers(sql, merchantAId, 'CUST001');
    const customerId = list[0].id;

    await expect(
      toggleLockCustomer(sql, merchantAId, customerId, 'STAFF', true)
    ).rejects.toThrow('MSG04');
  });

  it('Owner khóa và mở lại khách hàng thành công', async () => {
    const list = await searchCustomers(sql, merchantAId, 'CUST001');
    const customerId = list[0].id;

    const locked = await toggleLockCustomer(sql, merchantAId, customerId, 'OWNER', true);
    expect(locked.status).toBe('LOCKED');

    const unlocked = await toggleLockCustomer(sql, merchantAId, customerId, 'OWNER', false);
    expect(unlocked.status).toBe('ACTIVE');
  });
});