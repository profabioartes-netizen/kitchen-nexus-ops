
-- ============ COMPLEMENT GROUPS ============
-- e.g. "Extras", "Tamanho", "Ponto da Carne"
CREATE TABLE public.complement_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.complement_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read complement_groups" ON public.complement_groups FOR SELECT USING (true);
CREATE POLICY "Anyone can insert complement_groups" ON public.complement_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update complement_groups" ON public.complement_groups FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete complement_groups" ON public.complement_groups FOR DELETE USING (true);

CREATE TRIGGER update_complement_groups_updated_at
  BEFORE UPDATE ON public.complement_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ COMPLEMENTS ============
-- Individual items within a group
CREATE TABLE public.complements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.complements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read complements" ON public.complements FOR SELECT USING (true);
CREATE POLICY "Anyone can insert complements" ON public.complements FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update complements" ON public.complements FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete complements" ON public.complements FOR DELETE USING (true);

-- ============ PRODUCT ↔ COMPLEMENT GROUP LINK ============
CREATE TABLE public.product_complement_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
  UNIQUE(product_id, group_id)
);

ALTER TABLE public.product_complement_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read product_complement_groups" ON public.product_complement_groups FOR SELECT USING (true);
CREATE POLICY "Anyone can insert product_complement_groups" ON public.product_complement_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete product_complement_groups" ON public.product_complement_groups FOR DELETE USING (true);

-- ============ SEED: Complement Groups & Complements ============
INSERT INTO public.complement_groups (name, min_select, max_select, required) VALUES
  ('Extras', 0, 3, false),
  ('Ponto da Carne', 1, 1, true),
  ('Tamanho', 1, 1, true);

INSERT INTO public.complements (group_id, name, price) VALUES
  ((SELECT id FROM public.complement_groups WHERE name='Extras'), 'Bacon', 5.00),
  ((SELECT id FROM public.complement_groups WHERE name='Extras'), 'Queijo Extra', 4.00),
  ((SELECT id FROM public.complement_groups WHERE name='Extras'), 'Ovo Frito', 3.50),
  ((SELECT id FROM public.complement_groups WHERE name='Extras'), 'Molho Especial', 2.00),
  ((SELECT id FROM public.complement_groups WHERE name='Ponto da Carne'), 'Mal Passado', 0),
  ((SELECT id FROM public.complement_groups WHERE name='Ponto da Carne'), 'Ao Ponto', 0),
  ((SELECT id FROM public.complement_groups WHERE name='Ponto da Carne'), 'Bem Passado', 0),
  ((SELECT id FROM public.complement_groups WHERE name='Tamanho'), 'Pequeno', 0),
  ((SELECT id FROM public.complement_groups WHERE name='Tamanho'), 'Médio', 3.00),
  ((SELECT id FROM public.complement_groups WHERE name='Tamanho'), 'Grande', 6.00);
