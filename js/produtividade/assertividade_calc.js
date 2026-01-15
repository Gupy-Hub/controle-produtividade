window.Produtividade = window.Produtividade || {};

Produtividade.AssertividadeCalc = {
    /**
     * Busca e processa as métricas de assertividade.
     * CORREÇÃO FINAL: Busca ESTRITAMENTE pela Data de Referência (end_time).
     * Removemos qualquer busca por Data de Auditoria para evitar distorções na meta.
     */
    buscarMetricas: async function(dataInicio, dataFim) {
        // Formatação ISO
        const dataFimFull = dataFim.includes('T') ? dataFim : `${dataFim}T23:59:59`;
        const dataInicioFull = dataInicio.includes('T') ? dataInicio : `${dataInicio}T00:00:00`;

        console.log(`🔍 Assertividade: Buscando ESTRITAMENTE por Referência (end_time) de [${dataInicioFull}] até [${dataFimFull}]`);

        // Busca única e definitiva
        const { data: auditorias, error } = await Sistema.supabase
            .from('assertividade')
            .select('usuario_id, porcentagem, data_referencia') 
            .gte('data_referencia', dataInicioFull)
            .lte('data_referencia', dataFimFull);

        if (error) {
            console.error("Erro ao buscar assertividade:", error.message);
            return { mapa: {}, global: { soma: 0, qtd: 0 } };
        }

        const mapa = {};
        let globalSoma = 0;
        let globalQtd = 0;

        if (auditorias && auditorias.length > 0) {
            auditorias.forEach(a => {
                // Foco na coluna 'porcentagem' (% Assert)
                let valStr = (a.porcentagem || '').toString().replace('%', '').replace(',', '.').trim();
                if (valStr === '') return;
                
                let val = parseFloat(valStr);
                
                // Validação Rígida (0-100)
                if (isNaN(val) || val < 0 || val > 100) return;

                // Agregação
                const uid = a.usuario_id;
                if (!mapa[uid]) mapa[uid] = { soma: 0, qtd: 0 };
                
                mapa[uid].soma += val;
                mapa[uid].qtd++;

                globalSoma += val;
                globalQtd++;
            });
            console.log(`✅ Assertividade: ${globalQtd} registros válidos processados.`);
        } else {
            console.warn("⚠️ Assertividade: Nenhum registro encontrado para a Data de Referência (end_time).");
            console.warn("DICA: Certifique-se de ter reimportado a planilha com o novo script.");
        }
        
        return { 
            mapa: mapa, 
            global: { soma: globalSoma, qtd: globalQtd } 
        };
    },

    calcularMedia: function(obj) {
        if (!obj || obj.qtd === 0) return 0;
        return obj.soma / obj.qtd;
    }
};