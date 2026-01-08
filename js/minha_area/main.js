window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    get supabase() {
        return window.Sistema ? window.Sistema.supabase : (window._supabase || null);
    }
};

MinhaArea.init = async function() {
    // 1. Verifica Login
    const storedUser = localStorage.getItem('usuario_logado');
    if (!storedUser && !window.location.pathname.includes('index.html')) {
        console.warn("MinhaArea: Usuário não logado.");
        return; 
    }
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        const elRole = document.getElementById('user-role-label');
        const elName = document.getElementById('user-name-display');
        
        // Atualiza interface
        if(elRole) elRole.innerText = `${MinhaArea.user.nome.split(' ')[0]} • ${MinhaArea.user.cargo || MinhaArea.user.funcao || 'Colaborador'}`;
        if(elName) elName.innerText = MinhaArea.user.nome.split(' ')[0];
    }

    // 2. Inicializa Sistema
    if (window.Sistema && !window.Sistema.supabase) {
        await window.Sistema.inicializar(false);
    }

    // 3. Define Data Inicial (Hoje) de forma segura
    const dateInput = document.getElementById('ma-global-date');
    if (dateInput) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        const dd = String(hoje.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        MinhaArea.dataAtual = hoje;
    }

    // 4. Carrega Aba Padrão
    MinhaArea.mudarAba('diario');
};

MinhaArea.atualizarDataGlobal = function(val) {
    if (!val) return;
    const [ano, mes, dia] = val.split('-').map(Number);
    // Define a data para o meio-dia para evitar problemas de fuso horário voltando o dia
    MinhaArea.dataAtual = new Date(ano, mes - 1, dia, 12, 0, 0);

    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        const abaAtiva = activeBtn.id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    }
};

MinhaArea.mudarAba = function(aba) {
    document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const view = document.getElementById(`ma-tab-${aba}`);
    const btn = document.getElementById(`btn-ma-${aba}`);
    
    if(view) view.classList.remove('hidden');
    if(btn) btn.classList.add('active');

    // Carrega o módulo correspondente
    if (aba === 'diario') {
        if(MinhaArea.Diario) MinhaArea.Diario.carregar();
        else console.error("Módulo Diário não carregado. Verifique js/minha_area/geral.js");
    }
    else if (aba === 'evolucao' && MinhaArea.Evolucao) MinhaArea.Evolucao.carregar();
    else if (aba === 'comparativo' && MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
    else if (aba === 'assertividade' && MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
    else if (aba === 'feedback' && MinhaArea.Feedback) MinhaArea.Feedback.carregar();
};

MinhaArea.getPeriodo = function() {
    const y = MinhaArea.dataAtual.getFullYear();
    const m = MinhaArea.dataAtual.getMonth();
    
    // Formata manualmente para YYYY-MM-DD para garantir precisão
    const format = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const inicio = new Date(y, m, 1);
    const fim = new Date(y, m + 1, 0); // Último dia do mês

    return {
        inicio: format(inicio),
        fim: format(fim)
    };
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);