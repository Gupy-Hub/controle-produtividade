const MinhaArea = {
    usuario: null,
    filtroPeriodo: 'mes',

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Identificar Usuário (CORREÇÃO: Usar 'usuario_logado' e remover Mock)
        const storedUser = localStorage.getItem('usuario_logado');
        
        if (!storedUser) {
            // Se não houver usuário logado, expulsa para o login
            window.location.href = 'index.html';
            return;
        }

        this.usuario = JSON.parse(storedUser);

        // Preenche o nome na interface
        const nomeEl = document.getElementById('user-name-display');
        if(nomeEl) nomeEl.innerText = this.usuario.nome;

        // 2. Data Inicial (Hoje)
        const dateInput = document.getElementById('global-date');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // 3. Carrega a aba padrão
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

    // Helper para calcular datas baseado no filtro
    getDatasFiltro: function() {
        const dateInput = document.getElementById('global-date');
        // Fallback para hoje se o input não existir ou estiver vazio
        let dataRef = (dateInput && dateInput.value) ? new Date(dateInput.value) : new Date();
        
        const ano = dataRef.getFullYear();
        const mes = dataRef.getMonth();

        let inicio, fim;

        if (this.filtroPeriodo === 'mes') {
            // Primeiro e último dia do mês selecionado
            inicio = new Date(ano, mes, 1).toISOString().split('T')[0];
            fim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
        } else if (this.filtroPeriodo === 'ano') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        } else if (this.filtroPeriodo === 'semana') {
            // Calcula início e fim da semana (Domingo a Sábado)
            // Cria uma cópia da data para não alterar a original
            const curr = new Date(dataRef);
            const diaSemana = curr.getDay(); // 0 (Domingo) a 6 (Sábado)
            
            // Ajusta para o último domingo (início da semana)
            const first = curr.getDate() - diaSemana;
            const dataInicio = new Date(curr.setDate(first));
            
            // Ajusta para o próximo sábado (fim da semana)
            const dataFim = new Date(curr.setDate(first + 6));

            inicio = dataInicio.toISOString().split('T')[0];
            fim = dataFim.toISOString().split('T')[0];
        }

        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Aguarda um pouco para garantir que o sistema base carregou
    setTimeout(() => { 
        if(typeof MinhaArea !== 'undefined') MinhaArea.init(); 
    }, 100);
});