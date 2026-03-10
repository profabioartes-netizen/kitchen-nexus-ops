
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ RESTAURANT TABLES ============
CREATE TABLE public.restaurant_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'reserved', 'bill')),
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read tables" ON public.restaurant_tables FOR SELECT USING (true);
CREATE POLICY "Anyone can update tables" ON public.restaurant_tables FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert tables" ON public.restaurant_tables FOR INSERT WITH CHECK (true);

CREATE TRIGGER update_restaurant_tables_updated_at
  BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CATEGORIES ============
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Anyone can insert categories" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update categories" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete categories" ON public.categories FOR DELETE USING (true);

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  station TEXT NOT NULL DEFAULT 'Cozinha',
  stock INTEGER DEFAULT -1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Anyone can insert products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update products" ON public.products FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete products" ON public.products FOR DELETE USING (true);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  waiter_name TEXT,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Anyone can insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update orders" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete orders" ON public.orders FOR DELETE USING (true);

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORDER ITEMS ============
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  sent_to_kitchen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read order_items" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert order_items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update order_items" ON public.order_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete order_items" ON public.order_items FOR DELETE USING (true);

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'pix')),
  amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert payments" ON public.payments FOR INSERT WITH CHECK (true);

-- ============ SEED: Categories ============
INSERT INTO public.categories (name, sort_order) VALUES
  ('Bebidas', 1), ('Lanches', 2), ('Pratos', 3), ('Sobremesas', 4);

-- ============ SEED: Products ============
INSERT INTO public.products (name, category_id, price, station, stock) VALUES
  ('Espresso', (SELECT id FROM public.categories WHERE name='Bebidas'), 6.00, 'Bar', -1),
  ('Cappuccino', (SELECT id FROM public.categories WHERE name='Bebidas'), 9.50, 'Bar', -1),
  ('Café Latte', (SELECT id FROM public.categories WHERE name='Bebidas'), 10.00, 'Bar', -1),
  ('Suco Natural', (SELECT id FROM public.categories WHERE name='Bebidas'), 12.00, 'Bar', 20),
  ('Água Mineral', (SELECT id FROM public.categories WHERE name='Bebidas'), 4.00, 'Bar', -1),
  ('Cerveja Artesanal', (SELECT id FROM public.categories WHERE name='Bebidas'), 18.00, 'Bar', 24),
  ('Croissant', (SELECT id FROM public.categories WHERE name='Lanches'), 8.50, 'Cozinha', 15),
  ('Panini Caprese', (SELECT id FROM public.categories WHERE name='Lanches'), 22.00, 'Cozinha', 10),
  ('Salada Caesar', (SELECT id FROM public.categories WHERE name='Pratos'), 28.00, 'Cozinha', -1),
  ('Filé com Fritas', (SELECT id FROM public.categories WHERE name='Pratos'), 45.00, 'Cozinha', 8),
  ('Risoto de Cogumelos', (SELECT id FROM public.categories WHERE name='Pratos'), 38.00, 'Cozinha', 5),
  ('Tiramisù', (SELECT id FROM public.categories WHERE name='Sobremesas'), 18.00, 'Cozinha', 12),
  ('Cheesecake', (SELECT id FROM public.categories WHERE name='Sobremesas'), 16.00, 'Cozinha', 10),
  ('Brownie', (SELECT id FROM public.categories WHERE name='Sobremesas'), 14.00, 'Cozinha', 18);

-- ============ SEED: Tables ============
INSERT INTO public.restaurant_tables (name, seats, status) VALUES
  ('Mesa 1', 2, 'free'), ('Mesa 2', 4, 'free'), ('Mesa 3', 4, 'free'),
  ('Mesa 4', 6, 'free'), ('Mesa 5', 2, 'free'), ('Mesa 6', 8, 'free'),
  ('Mesa 7', 4, 'free'), ('Mesa 8', 2, 'free'), ('Mesa 9', 6, 'free'),
  ('Mesa 10', 4, 'free'), ('Mesa 11', 2, 'free'), ('Mesa 12', 8, 'free');
