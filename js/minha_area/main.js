window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(), // Garante inicialização
    usuarioAlvo: 'todos',
    
    get supabase() { return window.Sistema ? window.Sistema.supabase : (window._supabase || null); }
};

MinhaArea.init = async function() {
    const storedUser = localStorage.getItem('usuario_logado');
    if (!storedUser && !window.location.pathname.includes('index.html')) return;
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        const isUserAdmin = MinhaArea.user.funcao === 'GESTORA' || MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;
        // Se for admin, começa com 'todos', senão usa o próprio ID
        MinhaArea.usuarioAlvo = isUserAdmin ? 'todos' : MinhaArea.user.id;
    }

    if (window.Sistema && !window.Sistema.supabase) await window.Sistema.inicializar(false);

    // --- LÓGICA DO FILTRO UNIFICADO ---
    const lastType = localStorage.getItem('ma_filter_type') || 'mes';
    const lastValue = localStorage.getItem('ma_filter_value');
    
    const selectType = document.getElementById('filtro-tipo');
    if (selectType) {
        selectType.value = lastType;
        MinhaArea.mudarTipoFiltro(lastType, lastValue);
    } else {
        // Fallback se o DOM não tiver o filtro ainda (ex: carregou antes do HTML)
        if (!MinhaArea.dataAtual) MinhaArea.dataAtual = new Date();
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

    const lastTab = localStorage.getItem('ma_lastActiveTab');
    MinhaArea.mudarAba(lastTab || 'diario');
};

// ... (Resto das funções mantidas iguais) ...
// MinhaArea.mudarTipoFiltro, MinhaArea.atualizarFiltroGlobal, etc.
// Importante: Manter a lógica de getPeriodo e mudarAba conforme o código anterior.

MinhaArea.mudarTipoFiltro = function(tipo, valorSalvo = null) {
    const container = document.getElementById('filtro-valor-container');
    if (!container) return;

    localStorage.setItem('ma_filter_type', tipo);
    let html = '';
    const hoje = new Date();
    
    let defaultValue = valorSalvo;

    if (tipo === 'dia') {
        if (!defaultValue) defaultValue = hoje.toISOString().split('T')[0];
        html = `<input type="date" id="filtro-valor" value="${defaultValue}" onchange="MinhaArea.atualizarFiltroGlobal(this.value)" class="bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer w-[120px]">`;
    } else if (tipo === 'mes') {
        if (!defaultValue) defaultValue = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
        html = `<input type="month" id="filtro-valor" value="${defaultValue}" onchange="MinhaArea.atualizarFiltroGlobal(this.value)" class="bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer w-[120px]">`;
    } else if (tipo === 'ano') {
        if (!defaultValue) defaultValue = hoje.getFullYear();
        html = `<input type="number" id="filtro-valor" value="${defaultValue}" min="2020" max="2030" onchange="MinhaArea.atualizarFiltroGlobal(this.value)" class="bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer w-[60px]">`;
    }

    container.innerHTML = html;
    if (!valorSalvo) {
        const input = document.getElementById('filtro-valor');
        if (input) MinhaArea.atualizarFiltroGlobal(input.value);
    }
};

MinhaArea.atualizarFiltroGlobal = function(val) {
    if (!val) return;
    localStorage.setItem('ma_filter_value', val);
    
    // Atualiza dataAtual também para consistência com códigos antigos que usam dataAtual
    if (val.length === 10) { // YYYY-MM-DD
        const [y, m, d] = val.split('-').map(Number);
        MinhaArea.dataAtual = new Date(y, m-1, d, 12, 0, 0);
    } else if (val.length === 7) { // YYYY-MM
        const [y, m] = val.split('-').map(Number);
        MinhaArea.dataAtual = new Date(y, m-1, 1, 12, 0, 0);
    } else if (val.length === 4) { // YYYY
        MinhaArea.dataAtual = new Date(Number(val), 0, 1, 12, 0, 0);
    }

    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) MinhaArea.mudarAba(activeBtn.id.replace('btn-ma-', ''));
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

MinhaArea.mudarAba = function(aba) {
    localStorage.setItem('ma_lastActiveTab', aba);
    document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const view = document.getElementById(`ma-tab-${aba}`);
    const btn = document.getElementById(`btn-ma-${aba}`);
    if(view) view.classList.remove('hidden');
    if(btn) btn.classList.add('active');

    if (aba === 'diario' && MinhaArea.Diario) MinhaArea.Diario.carregar();
    else if (aba === 'evolucao' && MinhaArea.Evolucao) MinhaArea.Evolucao.carregar();
    else if (aba === 'comparativo' && MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
    else if (aba === 'assertividade' && MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
    else if (aba === 'feedback' && MinhaArea.Feedback) MinhaArea.Feedback.carregar();
};

MinhaArea.getPeriodo = function() {
    const tipo = document.getElementById('filtro-tipo')?.value || 'mes';
    const val = document.getElementById('filtro-valor')?.value;
    
    let inicio = '', fim = '', texto = '';

    if (!val) { 
        // Fallback
        const h = new Date();
        inicio = h.toISOString().split('T')[0];
        fim = inicio;
    } else {
        if (tipo === 'dia') {
            inicio = val; fim = val;
            texto = new Date(val + 'T12:00:00').toLocaleDateString('pt-BR');
        } else if (tipo === 'mes') {
            const [y, m] = val.split('-').map(Number);
            inicio = `${y}-${String(m).padStart(2,'0')}-01`;
            const lastDay = new Date(y, m, 0).getDate();
            fim = `${y}-${String(m).padStart(2,'0')}-${lastDay}`;
            texto = `${String(m).padStart(2,'0')}/${y}`;
        } else if (tipo === 'ano') {
            inicio = `${val}-01-01`;
            fim = `${val}-12-31`;
            texto = val;
        }
    }
    return { inicio, fim, texto, tipo };
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);