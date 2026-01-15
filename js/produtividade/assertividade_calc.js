window.Produtividade = window.Produtividade || {};

Produtividade.AssertividadeCalc = {
    /**
     * Busca e processa as métricas de assertividade.
     * CORREÇÃO: Remove busca da coluna inexistente 'indice_assertividade'.
     * Foco total na coluna 'porcentagem' (vinda do % Assert do CSV).
     */
    buscarMetricas: async function(dataInicio, dataFim) {
        // Formatação ISO para evitar erro 400 em datas
        const dataFimFull = dataFim.includes('T') ? dataFim : `${dataFim}T23:59:59`;
        const dataInicioFull = dataInicio.includes('T') ? dataInicio : `${dataInicio}T00:00:00`;

        console.log(`🔍 Assertividade: Buscando de [${dataInicioFull}] até [${dataFimFull}]`);

        let auditorias = [];
        let origemDados = "NENHUM";

        // 1. TENTATIVA PRIMARY: DATA DE REFERÊNCIA (Padrão Ouro)
        // Removido 'indice_assertividade' da query pois não existe no banco
        const { data: dadosRef, error: errRef } = await Sistema.supabase
            .from('assertividade')
            .select('usuario_id, porcentagem, data_referencia') 
            .gte('data_referencia', dataInicioFull)
            .lte('data_referencia', dataFimFull);

        if (!errRef && dadosRef && dadosRef.length > 0) {
            auditorias = dadosRef;
            origemDados = "REFERENCIA";
        } else {
            // 2. TENTATIVA FALLBACK: DATA DE AUDITORIA (Legado)
            if (errRef) console.warn("Aviso busca primária:", errRef.message);
            console.warn("⚠️ Assertividade: Sem dados por Referência ou Erro. Tentando Data de Auditoria...");
            
            const { data: dadosAudit, error: errAudit } = await Sistema.supabase
                .from('assertividade')
                .select('usuario_id, porcentagem, data_auditoria') 
                .gte('data_auditoria', dataInicioFull)
                .lte('data_auditoria', dataFimFull);
                
            if (!errAudit && dadosAudit && dadosAudit.length > 0) {
                auditorias = dadosAudit;
                origemDados = "AUDITORIA";
            } else if (errAudit) {
                console.error("Erro busca secundária:", errAudit.message);
            }
        }

        const mapa = {};
        let globalSoma = 0;
        let globalQtd = 0;

        if (auditorias.length > 0) {
            console.log(`✅ Assertividade: ${auditorias.length} registros encontrados via [${origemDados}]. Processando...`);
            
            auditorias.forEach(a => {
                // Foco exclusivo na coluna 'porcentagem'
                let rawValue = a.porcentagem;
                
                // Normalização (Texto "98,5%" para Número 98.5)
                let valStr = (rawValue || '').toString().replace('%', '').replace(',', '.').trim();
                
                // Se vazio após limpeza, ignora
                if (valStr === '') return;
                
                let val = parseFloat(valStr);
                
                // Validação de Integridade (Ignora NaN e valores fora de 0-100)
                if (isNaN(val) || val < 0 || val > 100) return;

                // Agregação por ID
                const uid = a.usuario_id;
                if (!mapa[uid]) mapa[uid] = { soma: 0, qtd: 0 };
                
                mapa[uid].soma += val;
                mapa[uid].qtd++;

                // Agregação Global
                globalSoma += val;
                globalQtd++;
            });
        } else {
            console.error("❌ Assertividade: Nenhum registro encontrado. Verifique se o banco possui dados na coluna 'porcentagem'.");
        }
        
        return { 
            mapa: mapa, 
            global: { soma: globalSoma, qtd: globalQtd } 
        };
    },

    /**
     * Calcula a média aritmética simples
     */
    calcularMedia: function(obj) {
        if (!obj || obj.qtd === 0) return 0;
        return obj.soma / obj.qtd;
    }
};