window.Produtividade = window.Produtividade || {};

Produtividade.AssertividadeCalc = {
    /**
     * Busca e processa as métricas de assertividade.
     * BLINDAGEM NEXUS: Ajusta datas para cobrir o dia inteiro (00:00:00 até 23:59:59).
     * Fallback Inteligente: Tenta 'data_referencia', se falhar busca 'data_auditoria'.
     */
    buscarMetricas: async function(dataInicio, dataFim) {
        // AJUSTE CRÍTICO DE TEMPO: Garante que pegamos até o último segundo do dia final.
        // Se dataFim for '2025-12-01', vira '2025-12-01 23:59:59'
        const dataFimFull = dataFim.includes(':') ? dataFim : `${dataFim} 23:59:59`;
        const dataInicioFull = dataInicio.includes(':') ? dataInicio : `${dataInicio} 00:00:00`;

        console.log(`🔍 Assertividade: Buscando de [${dataInicioFull}] até [${dataFimFull}]`);

        let auditorias = [];
        let origemDados = "NENHUM";

        // 1. TENTATIVA PRIMARY: DATA DE REFERÊNCIA (Padrão Ouro)
        const { data: dadosRef, error: errRef } = await Sistema.supabase
            .from('assertividade')
            .select('usuario_id, porcentagem, indice_assertividade, data_referencia') 
            .gte('data_referencia', dataInicioFull)
            .lte('data_referencia', dataFimFull);

        if (!errRef && dadosRef && dadosRef.length > 0) {
            auditorias = dadosRef;
            origemDados = "REFERENCIA";
        } else {
            // 2. TENTATIVA FALLBACK: DATA DE AUDITORIA (Legado)
            console.warn("⚠️ Assertividade: Sem dados por Referência. Ativando Protocolo Fallback (Data Auditoria)...");
            
            const { data: dadosAudit, error: errAudit } = await Sistema.supabase
                .from('assertividade')
                .select('usuario_id, porcentagem, indice_assertividade, data_auditoria') 
                .gte('data_auditoria', dataInicioFull)
                .lte('data_auditoria', dataFimFull);
                
            if (!errAudit && dadosAudit && dadosAudit.length > 0) {
                auditorias = dadosAudit;
                origemDados = "AUDITORIA";
            }
        }

        const mapa = {};
        let globalSoma = 0;
        let globalQtd = 0;

        if (auditorias.length > 0) {
            console.log(`✅ Assertividade: ${auditorias.length} registros encontrados via [${origemDados}]. Processando...`);
            
            auditorias.forEach(a => {
                // Lógica de Prioridade: Porcentagem Real > Índice Assertividade
                let rawValue = a.porcentagem;
                if (rawValue === null || rawValue === undefined || rawValue === '') {
                    rawValue = a.indice_assertividade;
                }

                // Normalização e Limpeza
                let valStr = (rawValue || '').toString().replace('%', '').replace(',', '.').trim();
                if (valStr === '') return;
                
                let val = parseFloat(valStr);
                
                // Validação de Integridade (0 a 100)
                if (isNaN(val) || val < 0 || val > 100) return;

                // Agregação por ID (Seguro)
                const uid = a.usuario_id;
                if (!mapa[uid]) mapa[uid] = { soma: 0, qtd: 0 };
                
                mapa[uid].soma += val;
                mapa[uid].qtd++;

                // Agregação Global
                globalSoma += val;
                globalQtd++;
            });
        } else {
            console.error("❌ Assertividade: Nenhum registro encontrado em nenhuma das datas. Verifique se há dados no banco para este período.");
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