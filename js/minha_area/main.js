window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    
    // Helper para garantir acesso ao Supabase global (vinda do sistema.js)
    get supabase() {
        return window.Sistema ? window.Sistema.supabase : (window._supabase || null);
    }
};

MinhaArea.init = async function() {
    // 1. Verifica Sessão
    const storedUser = localStorage.getItem('usuario_logado');
    // Se não estiver na tela de login e não tiver usuário, apenas avisa (ou redirecionaria)
    if (!storedUser && !window.location.pathname.includes('index.html')) {
        console.warn("MinhaArea: Usuário não logado.");
        return; 
    }
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        const elRole = document.getElementById('user-role-label');
        // Exibe Nome e Cargo no topo (se o elemento existir no HTML)
        if(elRole) elRole.innerText = `${MinhaArea.user.nome.split(' ')[0]} • ${MinhaArea.user.cargo || MinhaArea.user.funcao}`;
    }

    // 2. Inicializa Sistema (Supabase) se necessário
    if (window.Sistema && !window.Sistema.supabase) {
        await window.Sistema.inicializar(false);
    }

    // 3. Define Data Inicial no Input (Hoje)
    const dateInput = document.getElementById('ma-global-date');
    if (dateInput) {
        // Ajusta para YYYY-MM-DD
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        const dd = String(hoje.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        
        // Sincroniza a variável interna
        MinhaArea.dataAtual = hoje;
    }

    // 4. Carrega Aba Padrão (Diário)
    MinhaArea.mudarAba('diario');
};

MinhaArea.atualizarDataGlobal = function(val) {
    if (!val) return;
    const [ano, mes, dia] = val.split('-').map(Number);
    
    // Cria data preservando o dia selecionado (setamos hora 12h para evitar problemas de fuso)
    MinhaArea.dataAtual = new Date(ano, mes - 1, dia, 12, 0, 0);

    // Identifica qual aba está ativa e recarrega ela
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        const abaAtiva = activeBtn.id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    }
};

MinhaArea.mudarAba = function(aba) {
    // 1. Gestão de UI das abas (Esconde todas views, remove active de todos botões)
    document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // 2. Ativa a aba selecionada visualmente
    const view = document.getElementById(`ma-tab-${aba}`);
    const btn = document.getElementById(`btn-ma-${aba}`);
    
    if(view) view.classList.remove('hidden');
    if(btn) btn.classList.add('active');

    // 3. Carregamento do Módulo Específico
    // Note que 'diario' chama o MinhaArea.Diario (antigo Geral refatorado)
    if (aba === 'diario' && MinhaArea.Diario) MinhaArea.Diario.carregar();
    else if (aba === 'evolucao' && MinhaArea.Evolucao) MinhaArea.Evolucao.carregar();
    else if (aba === 'comparativo' && MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
    else if (aba === 'assertividade' && MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
    else if (aba === 'feedback' && MinhaArea.Feedback) MinhaArea.Feedback.carregar();
};

MinhaArea.getPeriodo = function() {
    // Retorna o primeiro e último dia do mês da data selecionada
    // Essa função é usada pelos módulos (ex: diario.js) para filtrar o Supabase
    const y = MinhaArea.dataAtual.getFullYear();
    const m = MinhaArea.dataAtual.getMonth();
    
    return {
        inicio: new Date(y, m, 1).toISOString().split('T')[0],
        fim: new Date(y, m + 1, 0).toISOString().split('T')[0]
    };
};

// Inicializa ao carregar o DOM
document.addEventListener('DOMContentLoaded', MinhaArea.init);