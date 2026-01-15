window.Produtividade = window.Produtividade || {};

Produtividade.AssertividadeCalc = {
    /**
     * Busca e processa as métricas de assertividade para o período.
     * Regra: Considera apenas valores válidos entre 0 e 100.
     * Retorna: { mapa: { usuario_id: { soma, qtd } }, global: { soma, qtd } }
     */
    buscarMetricas: async function(dataInicio, dataFim) {
        // Busca apenas as colunas necessárias para otimizar tráfego
        const { data: auditorias, error } = await Sistema.supabase
            .from('assertividade')
            .select('usuario_id, porcentagem')
            .gte('data_auditoria', dataInicio)
            .lte('data_auditoria', dataFim);

        if (error) {
            console.warn("Erro ao buscar assertividade (Service):", error);
            return { mapa: {}, global: { soma: 0, qtd: 0 } };
        }

        const mapa = {};
        let globalSoma = 0;
        let globalQtd = 0;

        if (auditorias) {
            auditorias.forEach(a => {
                // 1. Normalização (Remove %, troca vírgula por ponto, trim)
                let valStr = (a.porcentagem || '').toString().replace('%', '').replace(',', '.').trim();
                if (valStr === '') return;
                
                let val = parseFloat(valStr);
                
                // 2. Validação Numérica
                if (isNaN(val)) return;

                // 3. REGRA DE OURO: Considerar apenas valores de 0 a 100
                if (val < 0 || val > 100) return;

                // 4. Agregação por Usuário
                const uid = a.usuario_id;
                if (!mapa[uid]) mapa[uid] = { soma: 0, qtd: 0 };
                
                mapa[uid].soma += val;
                mapa[uid].qtd++;

                // 5. Agregação Global
                globalSoma += val;
                globalQtd++;
            });
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