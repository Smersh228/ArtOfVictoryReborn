-- Немецкий штаб (id_unit 16): те же приказы, что у советского штаба (15).
INSERT INTO unit_order (id_unit, id_orders)
SELECT 16, uo.id_orders
FROM unit_order uo
WHERE uo.id_unit = 15
  AND NOT EXISTS (
    SELECT 1 FROM unit_order x
    WHERE x.id_unit = 16 AND x.id_orders = uo.id_orders
  );
