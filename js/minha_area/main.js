window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    // Garante acesso ao Supabase global
    get supabase() {
        return window.Sistema ? window.Sistema.supabase : (window._supabase || null);
    }
};

MinhaArea.init = async function() {
    // 1. Verifica Sessão
    const storedUser = localStorage.getItem('usuario_logado');
    // Se não estiver logado e não for tela de login, para a execução
    if (!storedUser && !window.location.pathname.includes('index.html')) {
        console.warn("MinhaArea: Usuário não logado.");
        return; 
    }
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        
        // Atualiza interface do topo (se existir)
        const elRole = document.getElementById('user-role-label');
        if(elRole) elRole.innerText = `${MinhaArea.user.nome.split(' ')[0]} • ${MinhaArea.user.cargo || MinhaArea.user.funcao || 'Colaborador'}`;
        
        const elName = document.getElementById('user-name-display');
        if(elName) elName.innerText = MinhaArea.user.nome.split(' ')[0];
    }

    // 2. Inicializa Sistema (Supabase) se necessário
    if (window.Sistema && !window.Sistema.supabase) {
        await window.Sistema.inicializar(false);
    }

    // 3. Define Data Inicial no Input (Hoje)
    const dateInput = document.getElementById('ma-global-date');
    if (dateInput) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        const dd = String(hoje.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        MinhaArea.dataAtual = hoje;
    }

    // 4. Carrega Aba Padrão (Diário)
    MinhaArea.mudarAba('diario');
};

MinhaArea.atualizarDataGlobal = function(val) {
    if (!val) return;
    const [ano, mes, dia] = val.split('-').map(Number);
    // Cria data preservando o dia (fixando 12h para evitar fuso)
    MinhaArea.dataAtual = new Date(ano, mes - 1, dia, 12, 0, 0);

    // Recarrega a aba que estiver ativa no momento
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        const abaAtiva = activeBtn.id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    }
};

MinhaArea.mudarAba = function(aba) {
    // Gestão visual (Esconde todas views, remove active dos botões)
    document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Ativa visualmente a aba selecionada
    const view = document.getElementById(`ma-tab-${aba}`);
    const btn = document.getElementById(`btn-ma-${aba}`);
    
    if(view) view.classList.remove('hidden');
    if(btn) btn.classList.add('active');

    // Carregamento Logico dos Módulos
    if (aba === 'diario') {
        if (MinhaArea.Diario) MinhaArea.Diario.carregar();
        else console.error("Módulo MinhaArea.Diario não encontrado. Verifique se geral.js foi carregado.");
    }
    else if (aba === 'evolucao' && MinhaArea.Evolucao) MinhaArea.Evolucao.carregar();
    else if (aba === 'comparativo' && MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
    else if (aba === 'assertividade' && MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
    else if (aba === 'feedback' && MinhaArea.Feedback) MinhaArea.Feedback.carregar();
};

MinhaArea.getPeriodo = function() {
    // Retorna o primeiro e último dia do mês da data selecionada
    const y = MinhaArea.dataAtual.getFullYear();
    const m = MinhaArea.dataAtual.getMonth();
    return {
        inicio: new Date(y, m, 1).toISOString().split('T')[0],
        fim: new Date(y, m + 1, 0).toISOString().split('T')[0]
    };
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);