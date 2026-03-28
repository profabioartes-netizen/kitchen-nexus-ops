
UPDATE restaurant_tables SET active = true WHERE id = '62a48d5b-552c-4475-9121-8afdeb4865d4';

INSERT INTO restaurant_tables (name, default_name, internal_number, seats, active, self_service_enabled, sort_order, status)
VALUES 
  ('Comanda 13', 'Comanda 13', 'Quiosque 5', 4, true, true, 28, 'free'),
  ('Comanda 14', 'Comanda 14', 'Quiosque 6', 4, true, true, 29, 'free');
