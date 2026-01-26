// ARQUIVO: js/sistema/assertividade.js
window.Sistema = window.Sistema || {};

Sistema.Assertividade = {
    // Configurações Globais de Metas e Cores
    config: {
        metaPadrao: 98.00,
        cores: {
            sucesso: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            atencao: { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
            erro: { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
            neutro: { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200' }
        }
    },

    /**
     * Busca Padronizada no Supabase
     * @param {Object} filtros - { data, empresa, assistente, status, limit, usuario_id }
     */
    buscar: async function(filtros = {}) {
        try {
            let query = Sistema.supabase
                .from('assertividade')
                .select('*')
                .order('data_referencia', { ascending: false })
                .order('id', { ascending: false });

            if (filtros.limit) query = query.limit(filtros.limit);
            
            // Filtros Dinâmicos
            if (filtros.data) query = query.eq('data_referencia', filtros.data);
            if (filtros.usuario_id) query = query.eq('usuario_id', filtros.usuario_id);
            if (filtros.status) query = query.eq('status', filtros.status);
            if (filtros.auditora) query = query.eq('auditora_nome', filtros.auditora);
            
            // Filtros de Texto (ILike)
            if (filtros.buscaGeral) {
                const termo = `%${filtros.buscaGeral}%`;
                query = query.or(`assistente_nome.ilike.${termo},empresa_nome.ilike.${termo},doc_name.ilike.${termo}`);
            }
            
            if (filtros.empresa) query = query.ilike('empresa_nome', `%${filtros.empresa}%`);
            if (filtros.assistente) query = query.ilike('assistente_nome', `%${filtros.assistente}%`);
            if (filtros.doc) query = query.ilike('doc_name', `%${filtros.doc}%`);
            if (filtros.obs) query = query.ilike('observacao', `%${filtros.obs}%`);

            const { data, error } = await query;
            if (error) throw error;
            
            return data || [];
        } catch (error) {
            console.error("Erro no Sistema.Assertividade.buscar:", error);
            throw error;
        }
    },

    /**
     * Calcula a cor baseada na porcentagem
     */
    obterEstiloPorcentagem: function(valor) {
        // Trata nulos ou strings vazias
        if (valor === null || valor === undefined || valor === '') return this.config.cores.neutro.text;
        
        // Converte para float se for string "98,5%"
        let num = typeof valor === 'string' ? parseFloat(valor.replace('%','').replace(',','.')) : valor;
        
        if (isNaN(num)) return this.config.cores.neutro.text;

        if (num >= 98.00) return "text-emerald-600 font-bold";
        if (num >= 95.00) return "text-amber-600 font-bold";
        return "text-rose-600 font-bold";
    },

    /**
     * Gera o HTML da Badge de Status (OK, NOK, etc)
     */
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
    },

    /**
     * Formata valor numérico para exibição (trata nulos)
     */
    formatarValor: function(valor, sufixo = '') {
        if (valor === null || valor === undefined || valor === '') return '<span class="text-slate-300">-</span>';
        return `<span>${valor}${sufixo}</span>`;
    }
};

console.log("✅ Sistema.Assertividade (Core) carregado.");