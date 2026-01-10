const MinhaArea = {
    usuario: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Identificar Usuário
        const storedUser = localStorage.getItem('usuario_logado');
        if (storedUser) {
            this.usuario = JSON.parse(storedUser);
        } else {
            this.usuario = { id: 0, nome: "Visitante" }; 
        }

        // 2. Data Inicial (Hoje)
        const dateInput = document.getElementById('global-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // 3. Inicia na aba padrão
        this.mudarAba('diario');
    },

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        
        const botoes = {
            'mes': document.getElementById('btn-periodo-mes'),
            'semana': document.getElementById('btn-periodo-semana'),
            'ano': document.getElementById('btn-periodo-ano')
        };

        Object.values(botoes).forEach(btn => {
            if(btn) btn.className = "px-3 py-1 text-[10px] font-bold rounded transition text-slate-500 hover:bg-white/50";
        });

        if(botoes[tipo]) {
            botoes[tipo].className = "px-3 py-1 text-[10px] font-bold rounded transition text-blue-600 bg-white shadow-sm";
        }

        this.atualizarTudo();
    },

    atualizarTudo: function() {
        // Verifica qual aba está visível e dispara o recarregamento do módulo correspondente
        if (!document.getElementById('ma-tab-diario').classList.contains('hidden')) {
            if (this.Geral) this.Geral.carregar();
        }
        else if (!document.getElementById('ma-tab-metas').classList.contains('hidden')) {
            if (this.Metas) this.Metas.carregar();
        }
        else if (!document.getElementById('ma-tab-assertividade').classList.contains('hidden')) {
            // Verifica se o objeto foi definido em assertividade.js
            if (this.Assertividade) this.Assertividade.carregar();
        }
        else if (!document.getElementById('ma-tab-auditoria').classList.contains('hidden')) {
            if (this.Auditoria) this.Auditoria.carregar();
        }
        else if (!document.getElementById('ma-tab-comparativo').classList.contains('hidden')) {
            if (this.Comparativo) this.Comparativo.carregar();
        }
        else if (!document.getElementById('ma-tab-feedback').classList.contains('hidden')) {
            if (this.Feedback) this.Feedback.carregar();
        }
    },

    mudarAba: function(abaId) {
        // Esconde todas as views
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        
        // Remove estado ativo de todos os botões
        document.querySelectorAll('.tab-btn').forEach(el => {
            el.classList.remove('bg-blue-50', 'text-blue-700'); 
            el.classList.add('text-slate-600'); 
        });

        // Mostra a view alvo
        const aba = document.getElementById(`ma-tab-${abaId}`);
        if(aba) {
            aba.classList.remove('hidden');
            aba.classList.add('animate-enter');
        }

        // Ativa o botão alvo
        const btn = document.getElementById(`btn-ma-${abaId}`);
        if(btn) {
            btn.classList.remove('text-slate-600');
            btn.classList.add('bg-blue-50', 'text-blue-700');
        }

        // Trigger de carregamento de dados
        // Nota: Certifique-se que os arquivos js/minha_area/xxx.js definam MinhaArea.XXX e tenham o método carregar()
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'assertividade' && this.Assertividade) this.Assertividade.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar();
    },

    getDatasFiltro: function() {
        const dateInput = document.getElementById('global-date');
        let dataRef = dateInput && dateInput.value ? new Date(dateInput.value) : new Date();
        dataRef.setHours(12,0,0,0);
        
        const ano = dataRef.getFullYear();
        const mes = dataRef.getMonth();

        let inicio, fim;

        if (this.filtroPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1).toISOString().split('T')[0];
            fim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
        } else if (this.filtroPeriodo === 'ano') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        } else if (this.filtroPeriodo === 'semana') {
            const curr = new Date(dataRef);
            const first = curr.getDate() - curr.getDay(); 
            const last = first + 6; 
            
            const dtInicio = new Date(curr); dtInicio.setDate(first);
            const dtFim = new Date(curr); dtFim.setDate(last);
            
            inicio = dtInicio.toISOString().split('T')[0];
            fim = dtFim.toISOString().split('T')[0];
        }

        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { 
        if(typeof MinhaArea !== 'undefined') MinhaArea.init(); 
    }, 100);
});