window.Produtividade = window.Produtividade || {};

Produtividade.AssertividadeCalc = {
    /**
     * Busca e processa as métricas de assertividade para o período.
     * Regra 1: Filtra por DATA DE REFERÊNCIA (Data do documento), não da auditoria.
     * Regra 2: Considera apenas valores válidos entre 0 e 100.
     * Retorna: { mapa: { usuario_id: { soma, qtd } }, global: { soma, qtd } }
     */
    buscarMetricas: async function(dataInicio, dataFim) {
        // CORREÇÃO CRÍTICA: Busca por 'data_referencia' para alinhar com a Produção.
        // Adicionado 'indice_assertividade' como backup caso 'porcentagem' venha nulo.
        const { data: auditorias, error } = await Sistema.supabase
            .from('assertividade')
            .select('usuario_id, porcentagem, indice_assertividade, data_referencia') 
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) {
            console.warn("Erro ao buscar assertividade (Service):", error);
            return { mapa: {}, global: { soma: 0, qtd: 0 } };
        }

        const mapa = {};
        let globalSoma = 0;
        let globalQtd = 0;

        if (auditorias) {
            auditorias.forEach(a => {
                // 1. Lógica de Fallback (Tenta 'porcentagem', se falhar tenta 'indice_assertividade')
                let rawValue = a.porcentagem;
                if (rawValue === null || rawValue === undefined || rawValue === '') {
                    rawValue = a.indice_assertividade;
                }

                // 2. Normalização
                let valStr = (rawValue || '').toString().replace('%', '').replace(',', '.').trim();
                if (valStr === '') return;
                
                let val = parseFloat(valStr);
                
                // 3. Validação Numérica
                if (isNaN(val)) return;

                // 4. REGRA DE OURO: Considerar apenas valores de 0 a 100
                if (val < 0 || val > 100) return;

                // 5. Agregação por Usuário (Vínculo Seguro por ID)
                const uid = a.usuario_id;
                if (!mapa[uid]) mapa[uid] = { soma: 0, qtd: 0 };
                
                mapa[uid].soma += val;
                mapa[uid].qtd++;

                // 6. Agregação Global
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