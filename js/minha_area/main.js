window.MinhaArea = window.MinhaArea || {
    supabase: null,
    user: null,
    dataAtual: new Date()
};

MinhaArea.init = async function() {
    const storedUser = localStorage.getItem('usuario_logado');
    // Se não estiver na tela de login e não tiver usuário, sai
    if (!storedUser && !window.location.pathname.includes('index.html')) {
        // window.location.href = 'index.html'; // Comentado para evitar loop se estiver testando local
        console.warn("Usuário não logado.");
        return;
    }
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        const elName = document.getElementById('user-name-display');
        const elRole = document.getElementById('user-role-label');
        if(elName) elName.innerText = MinhaArea.user.nome.split(' ')[0];
        if(elRole) elRole.innerText = `${MinhaArea.user.funcao} • ${MinhaArea.user.contrato || 'PJ'}`;
    }

    if (window._supabase) {
        MinhaArea.supabase = window._supabase;
    } else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        MinhaArea.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = MinhaArea.supabase;
    }

    MinhaArea.renderizaData();
    MinhaArea.mudarAba('geral');
};

MinhaArea.mudarAba = function(aba) {
    document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.ma-tab').forEach(btn => btn.classList.remove('active'));
    
    const view = document.getElementById(`ma-tab-${aba}`);
    const btn = document.getElementById(`btn-ma-${aba}`);
    
    if(view) view.classList.remove('hidden');
    if(btn) btn.classList.add('active');

    // Só carrega se o módulo existir
    if (aba === 'geral' && MinhaArea.Geral) MinhaArea.Geral.carregar();
    else if (aba === 'evolucao' && MinhaArea.Evolucao) MinhaArea.Evolucao.carregar();
    else if (aba === 'comparativo' && MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
    else if (aba === 'assertividade' && MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
    else if (aba === 'feedback' && MinhaArea.Feedback) MinhaArea.Feedback.carregar();
};

MinhaArea.alterarMes = function(delta) {
    MinhaArea.dataAtual.setMonth(MinhaArea.dataAtual.getMonth() + delta);
    MinhaArea.renderizaData();
    
    const activeBtn = document.querySelector('.ma-tab.active');
    if (activeBtn) {
        const abaAtiva = activeBtn.id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    }
};

MinhaArea.renderizaData = function() {
    const displayMes = document.getElementById('display-mes');
    const displayAno = document.getElementById('display-ano');

    // CORREÇÃO DO ERRO CRÍTICO:
    // Se os elementos não existem na página atual (ex: estou na página Gestão), para aqui.
    if (!displayMes || !displayAno) return;

    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    displayMes.innerText = meses[MinhaArea.dataAtual.getMonth()];
    displayAno.innerText = MinhaArea.dataAtual.getFullYear();
};

MinhaArea.getPeriodo = function() {
    const y = MinhaArea.dataAtual.getFullYear();
    const m = MinhaArea.dataAtual.getMonth();
    return {
        inicio: new Date(y, m, 1).toISOString().split('T')[0],
        fim: new Date(y, m + 1, 0).toISOString().split('T')[0]
    };
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);