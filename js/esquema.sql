-- 1. Corrigir AUDITORAS
UPDATE usuarios SET perfil = 'AUDITORA' WHERE funcao ILIKE '%AUDITORA%';

-- 2. Corrigir GESTORAS
UPDATE usuarios SET perfil = 'GESTORA' WHERE funcao ILIKE '%GESTORA%';

-- 3. Corrigir ADMINS
UPDATE usuarios SET perfil = 'ADMIN' WHERE funcao ILIKE '%ADMIN%' OR nome ILIKE '%ADMIN%';