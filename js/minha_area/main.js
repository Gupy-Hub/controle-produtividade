window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    usuarioAlvo: 'todos', // Padrão
    
    get supabase() { return window.Sistema ? window.Sistema.supabase : (window._supabase || null); }
};

MinhaArea.init = async function() {
    const storedUser = localStorage.getItem('usuario_logado');
    if (!storedUser && !window.location.pathname.includes('index.html')) return;
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        // Se não for admin, o alvo é ele mesmo. Se for admin, começa com 'todos'
        const isUserAdmin = MinhaArea.user.funcao === 'GESTORA' || MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;
        MinhaArea.usuarioAlvo = isUserAdmin ? 'todos' : MinhaArea.user.id;
    }

    if (window.Sistema && !window.Sistema.supabase) await window.Sistema.inicializar(false);

    // Data Global
    const dateInput = document.getElementById('ma-global-date');
    const lastDate = localStorage.getItem('ma_lastGlobalDate');
    if (dateInput) {
        if (lastDate) {
            dateInput.value = lastDate;
            const [ano, mes, dia] = lastDate.split('-').map(Number);
            MinhaArea.dataAtual = new Date(ano, mes - 1, dia, 12, 0, 0);
        } else {
            const hoje = new Date();
            dateInput.value = hoje.toISOString().split('T')[0];
            MinhaArea.dataAtual = hoje;
            localStorage.setItem('ma_lastGlobalDate', dateInput.value);
        }
    }
    
    // Admin Controls
    const isAdmin = ['GESTORA', 'AUDITORA'].includes((MinhaArea.user.funcao||'').toUpperCase()) || MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;

    if (isAdmin) {
        const controls = document.getElementById('admin-controls');
        const select = document.getElementById('admin-user-select');
        if(controls && select) {
            controls.classList.remove('hidden');
            await MinhaArea.carregarListaUsuarios(select);
        }
    }

    // Restore Tab
    const lastTab = localStorage.getItem('ma_lastActiveTab');
    MinhaArea.mudarAba(lastTab || 'diario');
};

MinhaArea.carregarListaUsuarios = async function(selectElement) {
    try {
        const { data, error } = await MinhaArea.supabase
            .from('usuarios')
            .select('id, nome')
            .eq('funcao', 'Assistente')
            .eq('ativo', true)
            .order('nome');

        if(error) throw error;

        selectElement.innerHTML = '<option value="todos">Toda a Equipe</option>';
        data.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.innerText = u.nome;
            selectElement.appendChild(opt);
        });
        selectElement.value = MinhaArea.usuarioAlvo;

    } catch (err) { console.error(err); }
};

MinhaArea.mudarUsuarioAlvo = function(val) {
    MinhaArea.usuarioAlvo = val;
    // Se estiver na aba OKR, dispara o filtro local, senão recarrega aba
    if (document.getElementById('ma-tab-evolucao').classList.contains('hidden') === false) {
        if(MinhaArea.Evolucao && MinhaArea.Evolucao.aplicarFiltroAssistente) {
            MinhaArea.Evolucao.aplicarFiltroAssistente();
        } else {
            MinhaArea.Evolucao.carregar();
        }
    } else {
        const activeBtn = document.querySelector('.tab-btn.active');
        if (activeBtn) MinhaArea.mudarAba(activeBtn.id.replace('btn-ma-', ''));
    }
};

MinhaArea.atualizarDataGlobal = function(val) {
    if (!val) return;
    localStorage.setItem('ma_lastGlobalDate', val);
    const [ano, mes, dia] = val.split('-').map(Number);
    MinhaArea.dataAtual = new Date(ano, mes - 1, dia, 12, 0, 0);

    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) MinhaArea.mudarAba(activeBtn.id.replace('btn-ma-', ''));
};

MinhaArea.mudarAba = function(aba) {
    localStorage.setItem('ma_lastActiveTab', aba);
    document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const view = document.getElementById(`ma-tab-${aba}`);
    const btn = document.getElementById(`btn-ma-${aba}`);
    if(view) view.classList.remove('hidden');
    if(btn) btn.classList.add('active');

    // Header Controls Logic
    const dateGlobal = document.getElementById('container-data-global');
    const okrControls = document.getElementById('okr-header-controls');

    if (aba === 'evolucao') {
        if(dateGlobal) dateGlobal.classList.remove('hidden');
        if(okrControls) okrControls.classList.remove('hidden');
    } else {
        if(dateGlobal) dateGlobal.classList.remove('hidden');
        if(okrControls) okrControls.classList.add('hidden');
    }

    if (aba === 'diario' && MinhaArea.Diario) MinhaArea.Diario.carregar();
    else if (aba === 'evolucao' && MinhaArea.Evolucao) MinhaArea.Evolucao.carregar();
    else if (aba === 'comparativo' && MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
    else if (aba === 'assertividade' && MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
    else if (aba === 'feedback' && MinhaArea.Feedback) MinhaArea.Feedback.carregar();
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