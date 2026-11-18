-- Opções estruturadas podem remover ingredientes (ex.: sem queijo).
ALTER TABLE recipe_components DROP CONSTRAINT IF EXISTS recipe_components_quantity_milli_check;
ALTER TABLE recipe_components ADD CONSTRAINT recipe_components_quantity_milli_check CHECK(quantity_milli <> 0);
