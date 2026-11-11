-- 0001_init.sql: schema and ledger protection.
-- Generated from docs/db-schema.md sections 2 and 3. If you change the schema, add a new migration
-- (never edit this one once it has been applied) and update db-schema.md in the same pull request.

CREATE EXTENSION IF NOT EXISTS citext;

-- FE2 / BR-18
CREATE TABLE merchants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE CHECK (code ~ '^MCH-[A-Z0-9]{6}$'),          -- CR-05
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FE1 / BR-02. Email is globally unique because login uses email only (MSG31).
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid REFERENCES merchants(id),
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,                                                  -- BCrypt
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('ADMIN','MERCHANT_OWNER','MERCHANT_STAFF')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'ADMIN') = (merchant_id IS NULL))                             -- Admin has no merchant
);
CREATE UNIQUE INDEX uq_one_owner_per_merchant ON users(merchant_id) WHERE role = 'MERCHANT_OWNER';

-- BR-19. The cookie holds a random token; only its SHA-256 hash is stored.
CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  user_id    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,                                              -- created_at + 8 hours
  revoked_at timestamptz
);
CREATE INDEX ix_sessions_user ON sessions(user_id);

-- FE4 / BR-07. No row = rules not set (MSG32, BR-22).
CREATE TABLE loyalty_rules (
  merchant_id             uuid PRIMARY KEY REFERENCES merchants(id),
  earn_ratio              bigint NOT NULL CHECK (earn_ratio BETWEEN 1 AND 1000000),            -- VND per point
  min_redemption_threshold bigint NOT NULL CHECK (min_redemption_threshold BETWEEN 1 AND 1000000), -- points
  updated_by              uuid NOT NULL REFERENCES users(id),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- FE6 / BR-08 / CR-07
CREATE TABLE api_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      uuid NOT NULL REFERENCES merchants(id),
  key_id           text NOT NULL UNIQUE,            -- public id sent in X-API-Key, e.g. oct_<32 hex>
  secret_encrypted bytea NOT NULL,                  -- AES-256-GCM: 12-byte nonce || ciphertext || 16-byte tag
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  created_by       uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz
);
CREATE INDEX ix_api_keys_merchant ON api_keys(merchant_id, status);
-- Max 5 keys with status ACTIVE or SUSPENDED per merchant: enforced in the service inside a
-- transaction that first locks the merchant row (SELECT ... FOR UPDATE), then counts, then inserts (MSG40).

-- FE3 / BR-04 / BR-05 / BR-16
CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id),
  customer_code text NOT NULL CHECK (customer_code ~ '^[A-Z0-9]{1,32}$'),
  name          text NOT NULL,
  phone         text CHECK (phone ~ '^0[0-9]{9}$'),                              -- optional
  balance       bigint NOT NULL DEFAULT 0 CHECK (balance >= 0 AND balance <= 1000000000),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, customer_code),                                           -- BR-04
  UNIQUE (id, merchant_id)                                                       -- lets transactions prove same-merchant
);
CREATE UNIQUE INDEX uq_customer_phone ON customers(merchant_id, phone) WHERE phone IS NOT NULL;   -- MSG38
-- customer_code and merchant_id never change after insert (enforced by the service; optional trigger).

-- FE5 / FE8 / BR-03 / BR-12 / BR-20
CREATE TABLE transactions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      text NOT NULL UNIQUE CHECK (code ~ '^TXN-[0-9]{8}-[A-Z0-9]{8}$'),   -- CR-05, also the on-chain id
  merchant_id               uuid NOT NULL REFERENCES merchants(id),
  customer_id               uuid NOT NULL,
  type                      text NOT NULL CHECK (type IN ('ISSUE','REDEEM','REVERSAL')),
  points                    bigint NOT NULL CHECK (points BETWEEN 1 AND 1000000),          -- CR-02 ceiling per request
  bill_amount               bigint CHECK (bill_amount BETWEEN 1 AND 1000000000),   -- ISSUE only
  earn_ratio                bigint CHECK (earn_ratio BETWEEN 1 AND 1000000),       -- ISSUE only (rule snapshot)
  balance_after             bigint NOT NULL CHECK (balance_after >= 0),
  reverses_transaction_id   uuid REFERENCES transactions(id),                      -- REVERSAL only
  performed_by_user_id      uuid REFERENCES users(id),
  performed_by_api_key_id   uuid REFERENCES api_keys(id),
  proof_hash                char(64) NOT NULL,                                     -- see section 4
  status                    text NOT NULL DEFAULT 'PENDING_ANCHOR'
                            CHECK (status IN ('PENDING_ANCHOR','ANCHORED','FAILED')),
  sui_digest                text,
  attempt_count             int  NOT NULL DEFAULT 0,                               -- anchoring retry fields (BR-03); counts only non-temporary failures (anchoring.md section 3)
  next_attempt_at           timestamptz NOT NULL DEFAULT now(),
  last_error                text,
  created_at                timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),  -- the API passes this value explicitly (section 4); the default is only a fallback
  FOREIGN KEY (customer_id, merchant_id) REFERENCES customers(id, merchant_id),    -- BR-01
  CONSTRAINT chk_type_fields CHECK (
       (type = 'ISSUE'    AND bill_amount IS NOT NULL AND earn_ratio IS NOT NULL AND reverses_transaction_id IS NULL)
    OR (type = 'REDEEM'   AND bill_amount IS NULL AND earn_ratio IS NULL AND reverses_transaction_id IS NULL)
    OR (type = 'REVERSAL' AND bill_amount IS NULL AND earn_ratio IS NULL AND reverses_transaction_id IS NOT NULL)),
  CONSTRAINT chk_actor  CHECK ((performed_by_user_id IS NOT NULL)::int + (performed_by_api_key_id IS NOT NULL)::int = 1),
  CONSTRAINT chk_digest CHECK ((status = 'ANCHORED') = (sui_digest IS NOT NULL))
);
-- BR-21: an original can be reversed only once.
CREATE UNIQUE INDEX uq_one_reversal ON transactions(reverses_transaction_id) WHERE type = 'REVERSAL';
CREATE INDEX ix_tx_merchant_time ON transactions(merchant_id, created_at DESC, id DESC);
CREATE INDEX ix_tx_customer_time ON transactions(customer_id, created_at DESC, id DESC);
CREATE INDEX ix_tx_anchor_queue  ON transactions(next_attempt_at) WHERE status = 'PENDING_ANCHOR';

-- BR-10
CREATE TABLE idempotency_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_api_key_id uuid REFERENCES api_keys(id),     -- external API calls: scope = API key
  scope_user_id    uuid REFERENCES users(id),        -- portal calls: scope = logged-in user
  idempotency_key  text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  request_hash     char(64) NOT NULL,                -- SHA-256 hex of method + '.' + path-with-query + '.' + sha256_hex(raw body)
  response_status  int NOT NULL,
  response_body    jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_api_key_id IS NOT NULL)::int + (scope_user_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX uq_idem_api  ON idempotency_keys(scope_api_key_id, idempotency_key) WHERE scope_api_key_id IS NOT NULL;
CREATE UNIQUE INDEX uq_idem_user ON idempotency_keys(scope_user_id,    idempotency_key) WHERE scope_user_id    IS NOT NULL;

-- CR-04. Stored in the database only (LI-03).
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants(id),
  actor_user_id uuid REFERENCES users(id),
  action      text NOT NULL,   -- RULE_UPDATED, API_KEY_CREATED, API_KEY_REVOKED, MERCHANT_APPROVED,
                               -- MERCHANT_SUSPENDED, STAFF_CREATED, STAFF_DEACTIVATED, CUSTOMER_DEACTIVATED, CUSTOMER_REACTIVATED,
                               -- PASSWORD_CHANGED, REVERSAL_CREATED
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_merchant_time ON audit_logs(merchant_id, created_at DESC);

-- Only status, sui_digest and the retry fields may change. No deletes, no truncate.
CREATE FUNCTION transactions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'transactions are immutable (BR-03)';
  END IF;
  IF ROW(NEW.id, NEW.code, NEW.merchant_id, NEW.customer_id, NEW.type, NEW.points, NEW.bill_amount,
         NEW.earn_ratio, NEW.balance_after, NEW.reverses_transaction_id, NEW.performed_by_user_id,
         NEW.performed_by_api_key_id, NEW.proof_hash, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.code, OLD.merchant_id, OLD.customer_id, OLD.type, OLD.points, OLD.bill_amount,
         OLD.earn_ratio, OLD.balance_after, OLD.reverses_transaction_id, OLD.performed_by_user_id,
         OLD.performed_by_api_key_id, OLD.proof_hash, OLD.created_at) THEN
    RAISE EXCEPTION 'transaction fields are immutable (BR-03)';
  END IF;
  IF OLD.status IN ('ANCHORED','FAILED') AND (NEW.status, NEW.sui_digest) IS DISTINCT FROM (OLD.status, OLD.sui_digest) THEN
    RAISE EXCEPTION 'ANCHORED and FAILED are final states (LI-08)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_transactions_guard BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_guard();

CREATE FUNCTION transactions_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'transactions are immutable (BR-03)'; END $$;
CREATE TRIGGER trg_transactions_no_truncate BEFORE TRUNCATE ON transactions
  FOR EACH STATEMENT EXECUTE FUNCTION transactions_no_truncate();

-- BR-21: a REVERSAL must point to an ISSUE or REDEEM of the same merchant and customer with equal points.
CREATE FUNCTION transactions_check_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o transactions%ROWTYPE;
BEGIN
  IF NEW.type <> 'REVERSAL' THEN RETURN NEW; END IF;
  SELECT * INTO o FROM transactions WHERE id = NEW.reverses_transaction_id;
  IF NOT FOUND OR o.type NOT IN ('ISSUE','REDEEM')
     OR o.merchant_id <> NEW.merchant_id OR o.customer_id <> NEW.customer_id OR o.points <> NEW.points THEN
    RAISE EXCEPTION 'invalid reversal target (BR-21)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_transactions_check_reversal BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_check_reversal();
