/* ARQUIVO: js/sistema/assertividade.js */
window.Sistema = window.Sistema || {};

Sistema.Assertividade = {
    // Configurações Globais de Metas e Cores
    config: {
        metaPadrao: 98.00,
        cores: {
            sucesso: { 
                class: 'text-emerald-600 font-bold bg-emerald-50 border border-emerald-100', 
                icon: '<i class="fas fa-check-circle"></i>', 
                color: '#059669', // Hex para gráficos
                bgHex: '#ecfdf5'
            },
            atencao: { 
                class: 'text-amber-600 font-bold bg-amber-50 border border-amber-100', 
                icon: '<i class="fas fa-exclamation-circle"></i>', 
                color: '#d97706',
                bgHex: '#fffbeb'
            },
            erro: { 
                class: 'text-rose-600 font-bold bg-rose-50 border border-rose-100', 
                icon: '<i class="fas fa-times-circle"></i>', 
                color: '#e11d48',
                bgHex: '#fff1f2'
            },
            neutro: { 
                class: 'text-slate-400 bg-slate-50 border border-slate-100', 
                icon: '', 
                color: '#94a3b8',
                bgHex: '#f8fafc'
            }
        }
    },

    /**
     * CÁLCULO CENTRAL DA MÉDIA (Lógica da Samaria)
     * Fórmula: Soma das Porcentagens / Quantidade de Auditorias
     * Exemplo: 3400 / 37 = 91.89
     * @param {number} somaPorcentagens - A soma bruta das notas (ex: 3400)
     * @param {number} quantidadeAuditorias - O número de documentos auditados (ex: 37)
     * @returns {number} A média simples (float)
     */
    calcularMedia: function(somaPorcentagens, quantidadeAuditorias) {
        const s = Number(somaPorcentagens) || 0;
        const q = Number(quantidadeAuditorias) || 0;
        
        if (q === 0) return 0;
        
        // Retorna o número puro para cálculos matemáticos
        return s / q; 
    },

    /**
     * Define a cor e o ícone baseado na média e na meta do mês
     * @param {number} media - O valor da média calculado
     * @param {number} metaAlvo - A meta a ser atingida (padrão 98.00)
     */
    obterStatusVisual: function(media, metaAlvo = null) {
        const meta = metaAlvo !== null ? Number(metaAlvo) : this.config.metaPadrao;
        const val = Number(media);

        if (val >= meta) return this.config.cores.sucesso;
        if (val >= (meta - 2.0)) return this.config.cores.atencao; // Zona de tolerância (ex: 96% a 97.9%)
        return this.config.cores.erro;
    },

    /**
     * Formata para exibição humana (ex: "91,89%")
     */
    formatarPorcentagem: function(valor) {
        return (Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    },

    /**
     * Gera o HTML padrão de uma célula de tabela (Badge com ícone)
     */
    renderizarCelulaHTML: function(soma, qtd, meta) {
        if (!qtd || qtd === 0) return '<span class="text-xs text-slate-300">-</span>';

        const media = this.calcularMedia(soma, qtd);
        const visual = this.obterStatusVisual(media, meta);
        const texto = this.formatarPorcentagem(media);

        return `
            <div class="flex items-center justify-center gap-1 ${visual.class} px-2 py-1 rounded w-fit mx-auto text-[10px] shadow-sm whitespace-nowrap">
                ${texto}
                ${visual.icon}
            </div>
            <span class="text-[9px] text-slate-400 block mt-0.5 text-center font-medium" title="Soma: ${soma} / Qtd: ${qtd}">
                (${qtd} aud.)
            </span>
        `;
    },

    // --- MÉTODOS DE BUSCA E INTEGRAÇÃO (Backend) ---

    /**
     * Busca Pesada/Relatório (Para Dashboards e Gráficos, ex: Minha Área)
     * Faz paginação automática para trazer grandes volumes (fura o limite de 1000 linhas).
     */
    buscarRelatorio: async function(filtros = {}) {
        const PAGE_SIZE = 1000;
        let todos = [];
        
        try {
            // 1. Conta primeiro para saber quantas páginas são necessárias
            let queryCount = Sistema.supabase
                .from('assertividade')
                .select('*', { count: 'exact', head: true });
            
            this._aplicarFiltrosComuns(queryCount, filtros);
            
            const { count, error: errCount } = await queryCount;
            if (errCount) throw errCount;
            if (count === 0) return [];

            const totalPages = Math.ceil(count / PAGE_SIZE);
            const promises = [];
            
            // Seleciona apenas colunas essenciais para performance
            const colunas = 'id, data_referencia, auditora_nome, tipo_documento, doc_name, observacao, status, empresa_nome, assistente_nome, qtd_nok, porcentagem_assertividade, qtd_campos, qtd_ok';

            for (let i = 0; i < totalPages; i++) {
                let query = Sistema.supabase
                    .from('assertividade')
                    .select(colunas)
                    .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
                
                this._aplicarFiltrosComuns(query, filtros);
                promises.push(query);
            }

            // Executa tudo em paralelo
            const responses = await Promise.all(promises);
            responses.forEach(res => { 
                if (res.data) todos = todos.concat(res.data); 
            });

            return todos;

        } catch (error) {
            console.error("Erro Sistema.Assertividade.buscarRelatorio:", error);
            throw error;
        }
    },

    /**
     * Busca Simples (Para tabelas leves, ex: Gestão)
     */
    buscar: async function(filtros = {}) {
        try {
            let query = Sistema.supabase
                .from('assertividade')
                .select('*')
                .order('data_referencia', { ascending: false })
                .order('id', { ascending: false });

            if (filtros.limit) query = query.limit(filtros.limit);
            this._aplicarFiltrosComuns(query, filtros);

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error("Erro Sistema.Assertividade.buscar:", error);
            throw error;
        }
    },

    // Privado: Aplica filtros comuns para evitar repetição de código
    _aplicarFiltrosComuns: function(query, filtros) {
        if (filtros.data) query.eq('data_referencia', filtros.data);
        if (filtros.inicio) query.gte('data_referencia', filtros.inicio);
        if (filtros.fim) query.lte('data_referencia', filtros.fim);
        if (filtros.usuario_id) query.eq('usuario_id', filtros.usuario_id);
        if (filtros.status) query.eq('status', filtros.status);
        if (filtros.auditora) query.eq('auditora_nome', filtros.auditora);
        if (filtros.apenasComAuditora) query.neq('auditora_nome', null);
        
        // Filtro de Texto Genérico
        if (filtros.buscaGeral) {
            const termo = `%${filtros.buscaGeral}%`;
            query.or(`assistente_nome.ilike.${termo},empresa_nome.ilike.${termo},doc_name.ilike.${termo}`);
        }
        
        if (filtros.empresa) query.ilike('empresa_nome', `%${filtros.empresa}%`);
        if (filtros.assistente) query.ilike('assistente_nome', `%${filtros.assistente}%`);
        if (filtros.doc) query.ilike('doc_name', `%${filtros.doc}%`);
        if (filtros.obs) query.ilike('observacao', `%${filtros.obs}%`);
    },

    renderizarBadgeStatus: function(status) {
        const st = (status || '').toUpperCase();
        let classes = 'bg-slate-100 text-slate-500 border-slate-200';
        let icone = '';

        if (['OK', 'VALIDO', 'APROVADO'].includes(st)) {
            classes = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            icone = '<i class="fas fa-check mr-1"></i>';
        }
        else if (st.includes('NOK') || st.includes('ERRO') || st.includes('REPROVADO')) {
            classes = 'bg-rose-50 text-rose-700 border-rose-200';
            icone = '<i class="fas fa-times mr-1"></i>';
        }
        else if (st.includes('REV') || st.includes('ATENCAO')) {
            classes = 'bg-amber-50 text-amber-700 border-amber-200';
            icone = '<i class="fas fa-exclamation mr-1"></i>';
        }

        return `<span class="px-2 py-0.5 rounded border text-[10px] font-bold ${classes} inline-flex items-center">${icone}${status || '-'}</span>`;
    }
};

console.log("✅ Sistema.Assertividade (Core) carregado.");