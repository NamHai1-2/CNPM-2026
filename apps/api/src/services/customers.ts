import { Sql } from '../db/client.js';

export interface CreateCustomerInput {
  code: string;
  name: string;
  phone?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
}

export async function createCustomer(sql: Sql, merchantId: string, input: CreateCustomerInput) {
  const { code, name, phone } = input;

  if (!code || /[a-z]/.test(code)) {
    throw new Error('Mã khách hàng không được để trống và không chứa chữ thường');
  }

  // Trùng mã khách hàng -> MSG27
  const [existingCode] = await sql`
    SELECT id FROM customers WHERE customer_code = ${code}
  `;
  if (existingCode) {
    throw new Error('MSG27');
  }

  // Trùng SĐT trong cùng cửa hàng -> MSG38
  if (phone) {
    const [existingPhone] = await sql`
      SELECT id FROM customers WHERE merchant_id = ${merchantId} AND phone = ${phone}
    `;
    if (existingPhone) {
      throw new Error('MSG38');
    }
  }

  const [customer] = await sql`
    INSERT INTO customers (merchant_id, customer_code, name, phone)
    VALUES (${merchantId}, ${code}, ${name}, ${phone || null})
    RETURNING id, merchant_id, customer_code as code, name, phone
  `;
  return customer;
}

export async function searchCustomers(sql: Sql, merchantId: string, query?: string) {
  if (!query) {
    return await sql`
      SELECT id, merchant_id, customer_code as code, name, phone
      FROM customers
      WHERE merchant_id = ${merchantId}
    `;
  }

  const pattern = `%${query}%`;
  return await sql`
    SELECT id, merchant_id, customer_code as code, name, phone
    FROM customers
    WHERE merchant_id = ${merchantId}
      AND (customer_code ILIKE ${pattern} OR name ILIKE ${pattern} OR phone ILIKE ${pattern})
  `;
}

export async function updateCustomer(sql: Sql, merchantId: string, customerId: string, input: UpdateCustomerInput) {
  const { name, phone } = input;

  if (phone) {
    const [existingPhone] = await sql`
      SELECT id FROM customers
      WHERE merchant_id = ${merchantId} AND phone = ${phone} AND id != ${customerId}
    `;
    if (existingPhone) {
      throw new Error('MSG38');
    }
  }

  const [updated] = await sql`
    UPDATE customers
    SET 
      name = COALESCE(${name || null}, name),
      phone = COALESCE(${phone || null}, phone)
    WHERE id = ${customerId} AND merchant_id = ${merchantId}
    RETURNING id, merchant_id, customer_code as code, name, phone
  `;
  return updated;
}

export async function toggleLockCustomer(sql: Sql, merchantId: string, customerId: string, role: string, isLocked: boolean) {
  if (role !== 'OWNER') {
    throw new Error('MSG04');
  }

  const [customer] = await sql`
    SELECT id, merchant_id, customer_code as code, name, phone FROM customers WHERE id = ${customerId} AND merchant_id = ${merchantId}
  `;

  return {
    ...customer,
    status: isLocked ? 'LOCKED' : 'ACTIVE',
  };
}