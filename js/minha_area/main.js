const MinhaArea = {
    usuario: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Verificação de Segurança
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);

        // 2. Data Global
        this.configurarDataGlobal();

        // 3. Inicia na aba padrão (Dia a Dia)
        this.mudarAba('diario');
    },

    configurarDataGlobal: function() {
        const dateInput = document.getElementById('global-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    },

    atualizarTudo: function() {
        // Identifica qual aba está ativa para recarregar apenas ela
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            this.carregarDadosAba(id);
        }
    },

    mudarAba: function(abaId) {
        // Esconde todas as views e remove active dos botões
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        // Mostra a view alvo e ativa o botão
        const aba = document.getElementById(`ma-tab-${abaId}`);
        const btn = document.getElementById(`btn-ma-${abaId}`);
        
        if(aba) aba.classList.remove('hidden');
        if(btn) btn.classList.add('active');

        // Carrega os dados da aba selecionada
        this.carregarDadosAba(abaId);
    },

    carregarDadosAba: function(abaId) {
        // Mapeamento das funções de carregamento
        if (abaId === 'diario' && this.Geral) this.Geral.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.carregar(); // Nova Aba
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.carregar(); // Nova Aba
    },

    mudarPeriodo: function(tipo) {
        this.filtroPeriodo = tipo;
        
        // Atualiza estilo dos botões
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
    setTimeout(() => { 
        if(typeof MinhaArea !== 'undefined') MinhaArea.init(); 
    }, 100);
});