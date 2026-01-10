const MinhaArea = {
    usuario: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Identificar Usuário (Auth Mock/Real)
        const storedUser = localStorage.getItem('usuario_ativo');
        this.usuario = storedUser ? JSON.parse(storedUser) : { id: 1, nome: "Usuário Teste" };

        const nomeEl = document.getElementById('user-name-display');
        if(nomeEl) nomeEl.innerText = this.usuario.nome;

        // 2. Data Inicial (Hoje)
        const dateInput = document.getElementById('global-date');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // 3. Inicia
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
        // Recarrega a aba ativa com os novos filtros
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-ma-', '');
            // Chama a função correta
            if (id === 'diario' && this.Diario) this.Diario.carregar();
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

        // Dispara carregamento
        if (abaId === 'diario' && this.Diario) this.Diario.carregar();
        if (abaId === 'metas' && this.Metas) this.Metas.carregar();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
    },

    // Helper para calcular datas basedo no filtro
    getDatasFiltro: function() {
        const dateInput = document.getElementById('global-date');
        let dataRef = dateInput ? new Date(dateInput.value) : new Date();
        const ano = dataRef.getFullYear();
        const mes = dataRef.getMonth();
        const dia = dataRef.getDate();

        let inicio, fim;

        if (this.filtroPeriodo === 'mes') {
            inicio = new Date(ano, mes, 1).toISOString().split('T')[0];
            fim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
        } else if (this.filtroPeriodo === 'ano') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        } else if (this.filtroPeriodo === 'semana') {
            // Calcula início e fim da semana (Dom-Sab)
            const curr = new Date(dataRef);
            const first = curr.getDate() - curr.getDay(); 
            const last = first + 6;
            inicio = new Date(curr.setDate(first)).toISOString().split('T')[0];
            fim = new Date(curr.setDate(last)).toISOString().split('T')[0];
        }

        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});