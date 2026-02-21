-- Seed the 14 markets in the universe
INSERT INTO markets (symbol, name, category) VALUES
    ('XAUUSD', 'Gold', 'commodity'),
    ('XAGUSD', 'Silver', 'commodity'),
    ('US500',  'S&P 500', 'index'),
    ('US100',  'Nasdaq 100', 'index'),
    ('US30',   'Dow Jones 30', 'index'),
    ('GER40',  'DAX 40', 'index'),
    ('AUS200', 'ASX 200', 'index'),
    ('UK100',  'FTSE 100', 'index'),
    ('JP225',  'Nikkei 225', 'index'),
    ('SPN35',  'IBEX 35', 'index'),
    ('EU50',   'Euro Stoxx 50', 'index'),
    ('FRA40',  'CAC 40', 'index'),
    ('HK50',   'Hang Seng 50', 'index'),
    ('N25',    'AEX 25', 'index')
ON CONFLICT (symbol) DO NOTHING;
