const MinhaArea = {
    usuario: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada (App Unificado)");
        
        // 1. Identificar Usuário (Sessão Única)
        const storedUser = localStorage.getItem('usuario_logado');
        
        if (!storedUser) {
            // Se não houver sessão, redireciona para login
            window.location.href = 'index.html';
            return;
        }

        this.usuario = JSON.parse(storedUser);

        // 2. Data Inicial (Hoje)
        const dateInput = document.getElementById('global-date');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // 3. Inicia na aba padrão
        this.mudarAba('diario');
    },

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        
        // Atualiza botões visuais
        ['mes', 'semana', 'ano'].forEach(t => {
            const btn = document.getElementById(`btn-periodo-${t}`);
            if(btn) {
                if(t === tipo) {
                    btn.className = "px-3 py-1 text-xs font-bold rounded bg-white shadow-sm text-blue-600 transition";
                } else {
                    btn.className = "px-3 py-1 text-xs font-bold rounded hover:bg-white hover:shadow-sm transition text-slate-500";
                }
            }
        });

        this.atualizarTudo();
    },

    atualizarTudo: function() {
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            
            // Mapeamento correto das funções
            // Nota: Se o arquivo se chama 'geral.js', ele provavelmente define MinhaArea.Geral
            if (id === 'diario') {
                if (this.Geral) this.Geral.carregar();
                else if (this.Diario) this.Diario.carregar();
            }
            if (id === 'metas' && this.Metas) this.Metas.carregar();
            if (id === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        }
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        const aba = document.getElementById(`ma-tab-${abaId}`);
        const btn = document.getElementById(`btn-ma-${abaId}`);
        
        if(aba) aba.classList.remove('hidden');
        if(btn) btn.classList.add('active');

        this.atualizarTudo();
    },

    getDatasFiltro: function() {
        const dateInput = document.getElementById('global-date');
        let dataRef = (dateInput && dateInput.value) ? new Date(dateInput.value) : new Date();
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
            const diaSemana = curr.getDay(); 
            const first = curr.getDate() - diaSemana;
            const dataInicio = new Date(curr.setDate(first));
            const dataFim = new Date(curr.setDate(first + 6));
            inicio = dataInicio.toISOString().split('T')[0];
            fim = dataFim.toISOString().split('T')[0];
        }

        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Aguarda o sistema base e menu carregarem
    setTimeout(() => { 
        if(typeof MinhaArea !== 'undefined') MinhaArea.init(); 
    }, 100);
});