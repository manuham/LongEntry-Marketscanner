-- Remove all stock symbols from the system
-- Clean up related data first, then remove the markets
DELETE FROM weekly_analysis WHERE symbol IN (
    SELECT symbol FROM markets WHERE category = 'stock'
);
DELETE FROM weekly_results WHERE symbol IN (
    SELECT symbol FROM markets WHERE category = 'stock'
);
DELETE FROM trades WHERE symbol IN (
    SELECT symbol FROM markets WHERE category = 'stock'
);
DELETE FROM candles WHERE symbol IN (
    SELECT symbol FROM markets WHERE category = 'stock'
);
DELETE FROM markets WHERE category = 'stock';
