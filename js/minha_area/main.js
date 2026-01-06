const MinhaArea = {
    supabase: null,
    user: null,
    dataAtual: new Date(),

    init: async function() {
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        
        MinhaArea.user = JSON.parse(storedUser);
        
        const elName = document.getElementById('user-name-display');
        const elRole = document.getElementById('user-role-label');
        if(elName) elName.innerText = MinhaArea.user.nome.split(' ')[0];
        if(elRole) elRole.innerText = `${MinhaArea.user.funcao} • ${MinhaArea.user.contrato || 'PJ'}`;

        // CORREÇÃO: Reutiliza conexão
        if (window._supabase) {
            MinhaArea.supabase = window._supabase;
        }
        else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            MinhaArea.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = MinhaArea.supabase;
        } else {
            console.error("Supabase não configurado.");
            return;
        }

        MinhaArea.renderizaData();
        MinhaArea.mudarAba('geral');
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.ma-tab').forEach(btn => btn.classList.remove('active'));
        
        const view = document.getElementById(`ma-tab-${aba}`);
        const btn = document.getElementById(`btn-ma-${aba}`);
        
        if(view) view.classList.remove('hidden');
        if(btn) btn.classList.add('active');

        if (aba === 'geral') MinhaArea.Geral.carregar();
        else if (aba === 'evolucao') MinhaArea.Evolucao.carregar();
        else if (aba === 'comparativo') MinhaArea.Comparativo.carregar();
        else if (aba === 'assertividade') MinhaArea.Assertividade.carregar();
        else if (aba === 'feedback') MinhaArea.Feedback.carregar();
    },

    alterarMes: function(delta) {
        MinhaArea.dataAtual.setMonth(MinhaArea.dataAtual.getMonth() + delta);
        MinhaArea.renderizaData();
        const abaAtiva = document.querySelector('.ma-tab.active').id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    },

    renderizaData: function() {
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        document.getElementById('display-mes').innerText = meses[MinhaArea.dataAtual.getMonth()];
        document.getElementById('display-ano').innerText = MinhaArea.dataAtual.getFullYear();
    },

    getPeriodo: function() {
        const y = MinhaArea.dataAtual.getFullYear();
        const m = MinhaArea.dataAtual.getMonth();
        const inicio = new Date(y, m, 1).toISOString().split('T')[0];
        const fim = new Date(y, m + 1, 0).toISOString().split('T')[0];
        return { inicio, fim };
    }
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);