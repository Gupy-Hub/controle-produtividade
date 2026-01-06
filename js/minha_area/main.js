const MinhaArea = {
    supabase: null,
    user: null,
    dataAtual: new Date(),

    init: async function() {
        // Verifica Login (simulado ou real)
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            alert("Você precisa estar logado.");
            window.location.href = 'index.html'; // Redireciona se não houver user
            return;
        }
        
        MinhaArea.user = JSON.parse(storedUser);
        
        // Atualiza UI do Header
        document.getElementById('user-name-display').innerText = MinhaArea.user.nome.split(' ')[0];
        document.getElementById('user-role-label').innerText = 
            `${MinhaArea.user.funcao} • ${MinhaArea.user.contrato || 'PJ'}`;

        // Conecta Supabase
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            MinhaArea.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = MinhaArea.supabase;
        } else {
            console.error("Supabase não configurado.");
            return;
        }

        // Renderiza Data Inicial
        MinhaArea.renderizaData();
        
        // Inicia na aba Geral
        MinhaArea.mudarAba('geral');
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.ma-tab').forEach(btn => btn.classList.remove('active'));
        
        const view = document.getElementById(`ma-tab-${aba}`);
        const btn = document.getElementById(`btn-ma-${aba}`);
        
        if(view) view.classList.remove('hidden');
        if(btn) btn.classList.add('active');

        // Carrega o módulo específico
        if (aba === 'geral') MinhaArea.Geral.carregar();
        else if (aba === 'evolucao') MinhaArea.Evolucao.carregar();
        else if (aba === 'comparativo') MinhaArea.Comparativo.carregar();
        else if (aba === 'assertividade') MinhaArea.Assertividade.carregar();
    },

    alterarMes: function(delta) {
        MinhaArea.dataAtual.setMonth(MinhaArea.dataAtual.getMonth() + delta);
        MinhaArea.renderizaData();
        
        // Recarrega a aba atual para atualizar os dados
        const abaAtiva = document.querySelector('.ma-tab.active').id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    },

    renderizaData: function() {
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        document.getElementById('display-mes').innerText = meses[MinhaArea.dataAtual.getMonth()];
        document.getElementById('display-ano').innerText = MinhaArea.dataAtual.getFullYear();
    },

    // Utilitário: Retorna Inicio e Fim do mês atual formatado YYYY-MM-DD
    getPeriodo: function() {
        const y = MinhaArea.dataAtual.getFullYear();
        const m = MinhaArea.dataAtual.getMonth();
        // Dia 1 do mês
        const inicio = new Date(y, m, 1).toISOString().split('T')[0];
        // Dia 0 do próximo mês (último dia deste mês)
        const fim = new Date(y, m + 1, 0).toISOString().split('T')[0];
        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);