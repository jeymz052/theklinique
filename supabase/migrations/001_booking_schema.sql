-- ============================================================
--  THE KLINIQUE — Supabase Booking Schema
--  Migration: 001_booking_schema.sql
--  Stack: Supabase (PostgreSQL) · Semaphore SMS · PayMongo QR PH
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. SERVICE CATEGORIES
-- ============================================================
CREATE TABLE service_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. SERVICES
-- ============================================================
CREATE TABLE services (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT,
  price           NUMERIC(10, 2) NOT NULL,         -- base price in PHP
  price_note      TEXT,                             -- e.g. "*price starts at", "*price per area"
  duration_mins   INT,                              -- appointment duration in minutes
  is_package      BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE for LHR yearly packages
  package_details TEXT,                             -- e.g. "UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR."
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. ADD-ONS  (e.g. + Skin Analyzer on Consultation)
-- ============================================================
CREATE TABLE service_addons (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT     NOT NULL DEFAULT 0
);

-- ============================================================
-- 4. AVAILABILITY — clinic operating hours per day-of-week
--    (0 = Sunday, 1 = Monday ... 6 = Saturday)
-- ============================================================
CREATE TABLE availability_schedules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (day_of_week)
);

-- ============================================================
-- 5. BLOCKED DATES — holidays, doctor leaves, etc.
-- ============================================================
CREATE TABLE blocked_dates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocked_date DATE NOT NULL UNIQUE,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. CLIENTS
-- ============================================================
CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     TEXT        NOT NULL,
  email         TEXT        UNIQUE,
  phone         TEXT        NOT NULL,               -- used for Semaphore SMS
  date_of_birth DATE,
  notes         TEXT,                               -- internal staff notes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. APPOINTMENTS
-- ============================================================
CREATE TYPE appointment_status AS ENUM (
  'pending',        -- just booked, awaiting confirmation
  'confirmed',      -- confirmed by staff
  'paid',           -- payment received
  'completed',      -- service rendered
  'cancelled',      -- cancelled by client or staff
  'no_show'         -- client did not show up
);

CREATE TABLE appointments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_no     TEXT NOT NULL UNIQUE,           -- human-readable e.g. TK-20260001
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  service_id       UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  appointment_date DATE        NOT NULL,
  appointment_time TIME        NOT NULL,
  status           appointment_status NOT NULL DEFAULT 'pending',
  total_amount     NUMERIC(10, 2) NOT NULL,
  notes            TEXT,                            -- client's special requests
  staff_notes      TEXT,                            -- internal notes
  cancelled_reason TEXT,
  cancelled_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. APPOINTMENT ADD-ONS (junction — add-ons selected per booking)
-- ============================================================
CREATE TABLE appointment_addons (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  addon_id        UUID NOT NULL REFERENCES service_addons(id) ON DELETE RESTRICT,
  price_snapshot  NUMERIC(10, 2) NOT NULL,           -- price at time of booking
  UNIQUE (appointment_id, addon_id)
);

-- ============================================================
-- 9. PAYMENTS  (PayMongo QR PH)
-- ============================================================
CREATE TYPE payment_status AS ENUM (
  'pending',
  'awaiting_payment',   -- QR generated, waiting for scan
  'paid',
  'failed',
  'refunded',
  'partially_refunded'
);

CREATE TYPE payment_method AS ENUM (
  'paymongo_qr_ph',
  'gcash',
  'bank_transfer',
  'cash',
  'other'
);

CREATE TABLE payments (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id       UUID NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  paymongo_payment_id  TEXT UNIQUE,                  -- PayMongo payment_intent id
  paymongo_source_id   TEXT UNIQUE,                  -- PayMongo QR source id
  paymongo_qr_code     TEXT,                         -- base64 / URL of QR image
  amount               NUMERIC(10, 2) NOT NULL,
  currency             CHAR(3) NOT NULL DEFAULT 'PHP',
  method               payment_method NOT NULL DEFAULT 'paymongo_qr_ph',
  status               payment_status NOT NULL DEFAULT 'pending',
  paid_at              TIMESTAMPTZ,
  refunded_at          TIMESTAMPTZ,
  refund_amount        NUMERIC(10, 2),
  metadata             JSONB,                        -- raw PayMongo webhook payload
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. SMS NOTIFICATIONS LOG  (Semaphore)
-- ============================================================
CREATE TYPE sms_event AS ENUM (
  'booking_confirmation',
  'payment_received',
  'appointment_reminder',     -- 24-hour reminder
  'appointment_reminder_1h',  -- 1-hour reminder
  'appointment_cancelled',
  'appointment_rescheduled',
  'custom'
);

CREATE TYPE sms_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'failed'
);

CREATE TABLE sms_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id   UUID REFERENCES appointments(id) ON DELETE SET NULL,
  recipient_phone  TEXT NOT NULL,
  event            sms_event  NOT NULL,
  message          TEXT       NOT NULL,
  semaphore_msg_id TEXT,                            -- Semaphore message_id
  status           sms_status NOT NULL DEFAULT 'queued',
  sent_at          TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. PRODUCTS (Laser Hair Removal Packages & future items)
-- ============================================================
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT        NOT NULL,             -- e.g. "LASER HAIR REMOVAL PACKAGE"
  name        TEXT        NOT NULL,
  description TEXT,
  price       NUMERIC(10, 2) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. CART / ORDERS  (for product purchases)
-- ============================================================
CREATE TYPE order_status AS ENUM (
  'cart',
  'pending_payment',
  'paid',
  'fulfilled',
  'cancelled'
);

CREATE TABLE orders (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_no TEXT NOT NULL UNIQUE,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  status       order_status NOT NULL DEFAULT 'cart',
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity   INT  NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  UNIQUE (order_id, product_id)
);

-- ============================================================
-- 13. AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_services
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_appointments
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_payments
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_orders
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- 14. REFERENCE NUMBER GENERATORS
--     Appointment: TK-YYYYNNNN  (e.g. TK-20260001)
--     Order:      TKO-YYYYNNNN  (e.g. TKO-20260001)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS appointment_ref_seq START 1;

CREATE OR REPLACE FUNCTION generate_appointment_ref()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TK-' || TO_CHAR(NOW(), 'YYYY') || LPAD(nextval('appointment_ref_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS order_ref_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_ref()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TKO-' || TO_CHAR(NOW(), 'YYYY') || LPAD(nextval('order_ref_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 15. INDEXES
-- ============================================================
CREATE INDEX idx_appointments_client_id  ON appointments(client_id);
CREATE INDEX idx_appointments_service_id ON appointments(service_id);
CREATE INDEX idx_appointments_date       ON appointments(appointment_date);
CREATE INDEX idx_appointments_status     ON appointments(status);
CREATE INDEX idx_payments_appointment_id ON payments(appointment_id);
CREATE INDEX idx_payments_status         ON payments(status);
CREATE INDEX idx_sms_logs_appointment_id ON sms_logs(appointment_id);
CREATE INDEX idx_sms_logs_status         ON sms_logs(status);
CREATE INDEX idx_clients_phone           ON clients(phone);
CREATE INDEX idx_clients_email           ON clients(email);
CREATE INDEX idx_services_category_id    ON services(category_id);
CREATE INDEX idx_order_items_order_id    ON order_items(order_id);

-- ============================================================
-- 16. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE service_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE services              ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_addons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_addons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items           ENABLE ROW LEVEL SECURITY;

-- Public read: service catalog & scheduling info
CREATE POLICY "public_read_categories"   ON service_categories    FOR SELECT USING (true);
CREATE POLICY "public_read_services"     ON services              FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_addons"       ON service_addons        FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_availability" ON availability_schedules FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_blocked"      ON blocked_dates         FOR SELECT USING (true);
CREATE POLICY "public_read_products"     ON products              FOR SELECT USING (is_active = true);

-- Clients: public insert (self-registration at booking), admin manages all
CREATE POLICY "public_insert_clients"    ON clients FOR INSERT WITH CHECK (true);
CREATE POLICY "service_role_clients"     ON clients USING (auth.role() = 'service_role');

-- Appointments: public insert & read (tighten with JWT claims post-auth)
CREATE POLICY "public_insert_appointments" ON appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "public_read_appointments"   ON appointments FOR SELECT USING (true);
CREATE POLICY "service_role_appointments"  ON appointments USING (auth.role() = 'service_role');

-- Appointment add-ons: public insert & read
CREATE POLICY "public_insert_appt_addons" ON appointment_addons FOR INSERT WITH CHECK (true);
CREATE POLICY "public_read_appt_addons"   ON appointment_addons FOR SELECT USING (true);
CREATE POLICY "service_role_appt_addons"  ON appointment_addons USING (auth.role() = 'service_role');

-- Payments: service_role only (written by PayMongo webhook handler)
CREATE POLICY "service_role_payments" ON payments USING (auth.role() = 'service_role');

-- SMS logs: service_role only (written by Semaphore integration)
CREATE POLICY "service_role_sms" ON sms_logs USING (auth.role() = 'service_role');

-- Orders: public insert & read
CREATE POLICY "public_insert_orders"      ON orders      FOR INSERT WITH CHECK (true);
CREATE POLICY "public_read_orders"        ON orders      FOR SELECT USING (true);
CREATE POLICY "service_role_orders"       ON orders      USING (auth.role() = 'service_role');
CREATE POLICY "public_insert_order_items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "public_read_order_items"   ON order_items FOR SELECT USING (true);
CREATE POLICY "service_role_order_items"  ON order_items USING (auth.role() = 'service_role');

-- Admin full access
CREATE POLICY "service_role_categories"   ON service_categories    USING (auth.role() = 'service_role');
CREATE POLICY "service_role_services"     ON services              USING (auth.role() = 'service_role');
CREATE POLICY "service_role_addons"       ON service_addons        USING (auth.role() = 'service_role');
CREATE POLICY "service_role_availability" ON availability_schedules USING (auth.role() = 'service_role');
CREATE POLICY "service_role_blocked"      ON blocked_dates         USING (auth.role() = 'service_role');
CREATE POLICY "service_role_products"     ON products              USING (auth.role() = 'service_role');

-- ============================================================
-- 17. SEED — Service Categories
-- ============================================================
INSERT INTO service_categories (name, slug, sort_order) VALUES
  ('Consultations',       'consultations',    1),
  ('Electrocautery',      'electrocautery',   2),
  ('Fillers',             'fillers',          3),
  ('Laser Treatments',    'laser-treatments', 4),
  ('Mesolipo',            'mesolipo',         5),
  ('Neurotoxin / Botox',  'neurotoxin-botox', 6),
  ('Skin Boosters',       'skin-boosters',    7),
  ('Thread Lift',         'thread-lift',      8);

-- ============================================================
-- 18. SEED — Services
-- ============================================================

-- CONSULTATIONS
INSERT INTO services (category_id, name, slug, price, duration_mins, sort_order)
SELECT id, 'Consult with Dr. Kharyl', 'consult-dr-kharyl', 1000.00, 30, 1
FROM service_categories WHERE slug = 'consultations';

-- Consultation add-on: Skin Analyzer
INSERT INTO service_addons (service_id, name, price, sort_order)
SELECT id, 'Skin Analyzer', 0.00, 1
FROM services WHERE slug = 'consult-dr-kharyl';

-- ELECTROCAUTERY
INSERT INTO services (category_id, name, slug, price, price_note, duration_mins, sort_order)
SELECT sc.id, t.name, t.slug, t.price, '*price starts at', 60, t.ord
FROM service_categories sc,
(VALUES
  ('Full Neck Wart/Moles/Milia/Syringoma',   'electrocautery-full-neck',  2000.00, 1),
  ('Full Face Wart/Moles/Milia/Syringoma',   'electrocautery-full-face',  1500.00, 2),
  ('Full Chest Wart/Moles/Milia/Syringoma',  'electrocautery-full-chest', 3500.00, 3),
  ('Upper Back Wart/Moles/Milia/Syringoma',  'electrocautery-upper-back', 3500.00, 4)
) AS t(name, slug, price, ord)
WHERE sc.slug = 'electrocautery';

-- FILLERS
INSERT INTO services (category_id, name, slug, price, duration_mins, sort_order)
SELECT sc.id, t.name, t.slug, t.price, 60, t.ord
FROM service_categories sc,
(VALUES
  ('Chin Fillers',            'fillers-chin',       12000.00, 1),
  ('Lip Fillers',             'fillers-lip',        12000.00, 2),
  ('Temporal Depression',     'fillers-temporal',   12000.00, 3),
  ('Nasolabial Fold Fillers', 'fillers-nasolabial', 12000.00, 4),
  ('Dissolving Fillers',      'fillers-dissolving', 10000.00, 5)
) AS t(name, slug, price, ord)
WHERE sc.slug = 'fillers';

-- LASER TREATMENTS
INSERT INTO services (category_id, name, slug, description, price, price_note, duration_mins, sort_order)
SELECT id,
  'CO2 Fractional Laser', 'laser-co2-fractional',
  'BOX SCARS / ICE PICK SCARS / DARK SPOTS / ACNE MARKS / STRETCH MARKS / TEXTURED SKIN',
  3000.00, '*price per area', 45, 1
FROM service_categories WHERE slug = 'laser-treatments';

-- MESOLIPO
INSERT INTO services (category_id, name, slug, price, duration_mins, sort_order)
SELECT sc.id, t.name, t.slug, t.price, 60, t.ord
FROM service_categories sc,
(VALUES
  ('Tummy',        'mesolipo-tummy',        6500.00, 1),
  ('Cheeks',       'mesolipo-cheeks',       3000.00, 2),
  ('Double Chin',  'mesolipo-double-chin',  3000.00, 3),
  ('Arms',         'mesolipo-arms',         5000.00, 4),
  ('Love Handles', 'mesolipo-love-handles', 5000.00, 5),
  ('Thighs',       'mesolipo-thighs',       5000.00, 6)
) AS t(name, slug, price, ord)
WHERE sc.slug = 'mesolipo';

-- NEUROTOXIN / BOTOX
INSERT INTO services (category_id, name, slug, price, duration_mins, sort_order)
SELECT sc.id, t.name, t.slug, t.price, 30, t.ord
FROM service_categories sc,
(VALUES
  ('Forehead Wrinkles',       'botox-forehead',    15000.00,  1),
  ('Jawtox',                  'botox-jawtox',      10000.00,  2),
  ('Alartox',                 'botox-alartox',      5000.00,  3),
  ('Crow''s Feet',            'botox-crows-feet',   5000.00,  4),
  ('Glabellar Lines',         'botox-glabellar',    5000.00,  5),
  ('Under Eye Botox',         'botox-under-eye',    3000.00,  6),
  ('Sweatox',                 'botox-sweatox',     12000.00,  7),
  ('Nose Tip Botox',          'botox-nose-tip',     3000.00,  8),
  ('Bunny Lines',             'botox-bunny-lines',  3000.00,  9),
  ('Nasolabial Folds',        'botox-nasolabial',   3000.00, 10),
  ('Neck Lines (Horizontal)', 'botox-neck-lines',  10000.00, 11)
) AS t(name, slug, price, ord)
WHERE sc.slug = 'neurotoxin-botox';

-- SKIN BOOSTERS
INSERT INTO services (category_id, name, slug, price, duration_mins, sort_order)
SELECT sc.id, t.name, t.slug, t.price, 45, t.ord
FROM service_categories sc,
(VALUES
  ('Hyaron',          'sb-hyaron',      8000.00, 1),
  ('Luhilo Snow',     'sb-luhilo',     20000.00, 2),
  ('Profilo',         'sb-profilo',    25000.00, 3),
  ('ASCE+ Exosomes',  'sb-asce',       15000.00, 4),
  ('Rejuran® Healer', 'sb-rejuran-h',  25000.00, 5),
  ('Rejuran® S',      'sb-rejuran-s',  20000.00, 6),
  ('Rejuran® I',      'sb-rejuran-i',  18000.00, 7)
) AS t(name, slug, price, ord)
WHERE sc.slug = 'skin-boosters';

-- THREAD LIFT
INSERT INTO services (category_id, name, slug, price, price_note, duration_mins, sort_order)
SELECT sc.id, t.name, t.slug, t.price, t.note, 90, t.ord
FROM service_categories sc,
(VALUES
  ('HIKO Nose Lift (PDO)',     'thread-hiko-pdo',  20000.00, NULL,                    1),
  ('HIKO Nose Lift (PCL)',     'thread-hiko-pcl',  25000.00, NULL,                    2),
  ('Face Lift (COG)',          'thread-face-cog',  18000.00, NULL,                    3),
  ('Face Lift (Mono Threads)', 'thread-face-mono',  8500.00, '*Price per 20 threads', 4)
) AS t(name, slug, price, note, ord)
WHERE sc.slug = 'thread-lift';

-- ============================================================
-- 19. SEED — Products (Laser Hair Removal Packages)
-- ============================================================
INSERT INTO products (category, name, description, price, sort_order) VALUES
  ('LASER HAIR REMOVAL PACKAGE', 'Underarms',       'UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR.', 12000.00, 1),
  ('LASER HAIR REMOVAL PACKAGE', 'Upper/Lower Lip', 'UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR.', 10000.00, 2),
  ('LASER HAIR REMOVAL PACKAGE', 'Beard',           'UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR.', 12000.00, 3),
  ('LASER HAIR REMOVAL PACKAGE', 'Bikini Lines',    'UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR.', 12000.00, 4),
  ('LASER HAIR REMOVAL PACKAGE', 'Brazilian',       'UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR.', 15000.00, 5),
  ('LASER HAIR REMOVAL PACKAGE', 'Legs (Half)',     'UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR.', 10000.00, 6),
  ('LASER HAIR REMOVAL PACKAGE', 'Legs (Full)',     'UNLIMITED DIODE LASER HAIR REMOVAL FOR A YEAR.', 15000.00, 7);

-- ============================================================
-- 20. SEED — Default Clinic Availability (Mon–Sat, 9 AM–6 PM)
--     Update times/days in Supabase Table Editor as needed.
-- ============================================================
INSERT INTO availability_schedules (day_of_week, open_time, close_time) VALUES
  (1, '09:00', '18:00'),  -- Monday
  (2, '09:00', '18:00'),  -- Tuesday
  (3, '09:00', '18:00'),  -- Wednesday
  (4, '09:00', '18:00'),  -- Thursday
  (5, '09:00', '18:00'),  -- Friday
  (6, '09:00', '18:00');  -- Saturday
-- Sunday (0) is closed by default. Insert to enable it.
