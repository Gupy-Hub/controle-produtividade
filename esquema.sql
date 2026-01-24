SELECT 
    table_name AS tabela, 
    column_name AS coluna, 
    data_type AS tipo, 
    is_nullable AS aceita_nulo
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public'
ORDER BY 
    table_name, ordinal_position;