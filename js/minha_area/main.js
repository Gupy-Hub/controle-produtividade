const MinhaArea = {
    usuario: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Identificar Usuário (Consistência com login.js)
        // Login.js usa 'usuario_logado'. Vamos priorizar isso.
        const storedUser = localStorage.getItem('usuario_logado');
        
        if (storedUser) {
            this.usuario = JSON.parse(storedUser);
        } else {
            // Fallback apenas para dev/teste, em prod redirecionaria
            this.usuario = { id: 0, nome: "Visitante" }; 
        }

        const nomeEl = document.getElementById('user-name-display');
        if(nomeEl) nomeEl.innerText = this.usuario.nome;

        // 2. Data Inicial (Hoje)
        const dateInput = document.getElementById('global-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // 3. Inicia na aba padrão ou recuperada
        // Poderíamos salvar a última aba no localStorage também (Pattern CEO/CTO)
        this.mudarAba('diario');
    },

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        
        // Atualiza botões visuais (Agora manipulando classes Tailwind diretamente no novo Menu)
        const botoes = {
            'mes': document.getElementById('btn-periodo-mes'),
            'semana': document.getElementById('btn-periodo-semana'),
            'ano': document.getElementById('btn-periodo-ano')
        };

        // Reset geral
        Object.values(botoes).forEach(btn => {
            if(btn) {
                btn.className = "px-3 py-1 text-[10px] font-bold rounded transition text-slate-500 hover:bg-white/50";
            }
        });

        // Ativa o selecionado
        if(botoes[tipo]) {
            botoes[tipo].className = "px-3 py-1 text-[10px] font-bold rounded transition text-blue-600 bg-white shadow-sm";
        }

        this.atualizarTudo();
    },

    atualizarTudo: function() {
        // Verifica qual aba está visível (não pelo botão, mas pela classe 'hidden' da view)
        // Isso é mais seguro se o botão perder estado
        if (!document.getElementById('ma-tab-diario').classList.contains('hidden')) {
            if (this.Geral) this.Geral.carregar();
        }
        else if (!document.getElementById('ma-tab-metas').classList.contains('hidden')) {
            if (this.Metas) this.Metas.carregar();
        }
        else if (!document.getElementById('ma-tab-comparativo').classList.contains('hidden')) {
            if (this.Comparativo) this.Comparativo.carregar();
        }
    },

    mudarAba: function(abaId) {
        // Esconde todas as views
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        
        // Remove estado ativo de todos os botões de aba
        document.querySelectorAll('.tab-btn').forEach(el => {
            el.classList.remove('bg-blue-50', 'text-blue-700'); // Remove estilo ativo
            el.classList.add('text-slate-600'); // Adiciona estilo inativo
        });

        // Mostra a view alvo
        const aba = document.getElementById(`ma-tab-${abaId}`);
        if(aba) {
            aba.classList.remove('hidden');
            aba.classList.add('animate-enter'); // Reaplica animação
        }

        // Ativa o botão alvo
        const btn = document.getElementById(`btn-ma-${abaId}`);
        if(btn) {
            btn.classList.remove('text-slate-600');
            btn.classList.add('bg-blue-50', 'text-blue-700');
        }

        // Carrega dados específicos
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
    },

    getDatasFiltro: function() {
        const dateInput = document.getElementById('global-date');
        let dataRef = dateInput && dateInput.value ? new Date(dateInput.value) : new Date();
        // Ajuste de fuso horário simples (considerando meio-dia para evitar problemas de UTC)
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
            const first = curr.getDate() - curr.getDay(); // Domingo
            const last = first + 6; // Sábado
            
            const dtInicio = new Date(curr); dtInicio.setDate(first);
            const dtFim = new Date(curr); dtFim.setDate(last);
            
            inicio = dtInicio.toISOString().split('T')[0];
            fim = dtFim.toISOString().split('T')[0];
        }

        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Timeout pequeno para garantir que menus renderizaram e supabase carregou
    setTimeout(() => { 
        if(typeof MinhaArea !== 'undefined') MinhaArea.init(); 
    }, 100);
});