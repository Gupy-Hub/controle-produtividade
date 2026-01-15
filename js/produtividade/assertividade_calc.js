window.Produtividade = window.Produtividade || {};

Produtividade.AssertividadeCalc = {
    /**
     * Busca métricas de assertividade baseadas na Data de Referência (end_time).
     */
    buscarMetricas: async function(dataInicio, dataFim) {
        // Garante formato ISO com hora completa para cobrir todo o dia
        const dataFimFull = dataFim.includes('T') ? dataFim : `${dataFim}T23:59:59.999`;
        const dataInicioFull = dataInicio.includes('T') ? dataInicio : `${dataInicio}T00:00:00.000`;

        console.log(`🔍 Assertividade: Buscando por Referência [${dataInicioFull} -> ${dataFimFull}]`);

        // Busca apenas pela data_referencia (que agora vem do end_time)
        const { data: auditorias, error } = await Sistema.supabase
            .from('assertividade')
            .select('usuario_id, porcentagem, data_referencia') 
            .gte('data_referencia', dataInicioFull)
            .lte('data_referencia', dataFimFull);

        if (error) {
            console.error("Erro SQL Assertividade:", error.message);
            return { mapa: {}, global: { soma: 0, qtd: 0 } };
        }

        const mapa = {};
        let globalSoma = 0;
        let globalQtd = 0;

        if (auditorias && auditorias.length > 0) {
            auditorias.forEach(a => {
                // Tenta ler a porcentagem
                let rawValue = a.porcentagem;
                
                // Normaliza (remove % e troca vírgula)
                let valStr = (rawValue || '').toString().replace('%', '').replace(',', '.').trim();
                
                if (valStr === '') return;
                
                let val = parseFloat(valStr);
                
                // Filtro de consistência (0 a 100)
                if (isNaN(val) || val < 0 || val > 100) return;

                // Agrega
                const uid = a.usuario_id;
                if (!mapa[uid]) mapa[uid] = { soma: 0, qtd: 0 };
                
                mapa[uid].soma += val;
                mapa[uid].qtd++;

                globalSoma += val;
                globalQtd++;
            });
            console.log(`✅ Assertividade: ${globalQtd} registros contabilizados.`);
        } else {
            console.warn("⚠️ Assertividade: Nenhum dado encontrado para este período. (Verifique se importou o CSV com o novo script)");
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