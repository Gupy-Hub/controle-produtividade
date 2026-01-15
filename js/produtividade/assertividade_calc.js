window.Produtividade = window.Produtividade || {};

Produtividade.AssertividadeCalc = {
    /**
     * Busca e processa as métricas de assertividade.
     * Lógica Híbrida: Tenta buscar por 'data_referencia'. 
     * Se não encontrar registros, faz fallback para 'data_auditoria' para garantir compatibilidade.
     */
    buscarMetricas: async function(dataInicio, dataFim) {
        let auditorias = [];
        let usouFallback = false;

        // 1. TENTATIVA PRINCIPAL: DATA DE REFERÊNCIA (Ideal para dados novos)
        const { data: dadosRef, error: errRef } = await Sistema.supabase
            .from('assertividade')
            .select('usuario_id, porcentagem, indice_assertividade') 
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (!errRef && dadosRef && dadosRef.length > 0) {
            auditorias = dadosRef;
        } else {
            // 2. TENTATIVA FALLBACK: DATA DE AUDITORIA (Para dados legados/sem referência)
            console.warn("⚠️ Assertividade: Nenhum dado por Data de Referência. Tentando Data de Auditoria...");
            
            const { data: dadosAudit, error: errAudit } = await Sistema.supabase
                .from('assertividade')
                .select('usuario_id, porcentagem, indice_assertividade') 
                .gte('data_auditoria', dataInicio)
                .lte('data_auditoria', dataFim);
                
            if (!errAudit && dadosAudit) {
                auditorias = dadosAudit;
                usouFallback = true;
            } else if (errAudit) {
                console.error("Erro busca assertividade:", errAudit);
            }
        }

        const mapa = {};
        let globalSoma = 0;
        let globalQtd = 0;

        if (auditorias) {
            auditorias.forEach(a => {
                // 1. Lógica de Valor (Prioriza 'porcentagem', senão 'indice_assertividade')
                let rawValue = a.porcentagem;
                if (rawValue === null || rawValue === undefined || rawValue === '') {
                    rawValue = a.indice_assertividade;
                }

                // 2. Normalização (Texto para Número)
                let valStr = (rawValue || '').toString().replace('%', '').replace(',', '.').trim();
                if (valStr === '') return;
                
                let val = parseFloat(valStr);
                
                // 3. Validação: Ignora NaN
                if (isNaN(val)) return;

                // 4. REGRA DE OURO: Considerar apenas valores de 0 a 100
                if (val < 0 || val > 100) return;

                // 5. Agregação por Usuário
                const uid = a.usuario_id;
                if (!mapa[uid]) mapa[uid] = { soma: 0, qtd: 0 };
                
                mapa[uid].soma += val;
                mapa[uid].qtd++;

                // 6. Agregação Global
                globalSoma += val;
                globalQtd++;
            });
        }
        
        if(usouFallback && globalQtd > 0) {
            console.log(`✅ Recuperados ${globalQtd} registros via Data de Auditoria.`);
        }
        
        return { 
            mapa: mapa, 
            global: { soma: globalSoma, qtd: globalQtd } 
        };
    },

    /**
     * Calcula a média aritmética simples dado um objeto acumulador
     * @param {Object} obj - { soma: number, qtd: number }
     * @returns {number} Média ou 0 se qtd for 0
     */
    calcularMedia: function(obj) {
        if (!obj || obj.qtd === 0) return 0;
        return obj.soma / obj.qtd;
    }
};