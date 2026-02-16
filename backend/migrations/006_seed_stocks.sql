-- Seed 23 FTMO stock CFDs into the markets universe
-- US stocks (15) and European stocks (8)
INSERT INTO markets (symbol, name, category) VALUES
    -- US Stocks
    ('AAPL',    'Apple Inc.',                'stock'),
    ('AMZN',    'Amazon.com Inc.',           'stock'),
    ('BABA',    'Alibaba Group',             'stock'),
    ('BAC',     'Bank of America',           'stock'),
    ('GOOG',    'Alphabet Inc.',             'stock'),
    ('META',    'Meta Platforms',            'stock'),
    ('MSFT',    'Microsoft Corp.',           'stock'),
    ('NFLX',    'Netflix Inc.',              'stock'),
    ('NVDA',    'NVIDIA Corp.',              'stock'),
    ('PFE',     'Pfizer Inc.',               'stock'),
    ('T',       'AT&T Inc.',                 'stock'),
    ('TSLA',    'Tesla Inc.',                'stock'),
    ('V',       'Visa Inc.',                 'stock'),
    ('WMT',     'Walmart Inc.',              'stock'),
    ('ZM',      'Zoom Video Communications', 'stock'),
    -- European Stocks
    ('AIRF',    'Air France-KLM',            'stock'),
    ('ALVG',    'Allianz SE',                'stock'),
    ('BAYGn',   'Bayer AG',                  'stock'),
    ('DBKGn',   'Deutsche Bank AG',          'stock'),
    ('IBE',     'Iberdrola SA',              'stock'),
    ('LVMH',    'LVMH Moët Hennessy',        'stock'),
    ('RACE',    'Ferrari NV',                'stock'),
    ('VOWG_p',  'Volkswagen AG',             'stock')
ON CONFLICT (symbol) DO NOTHING;
