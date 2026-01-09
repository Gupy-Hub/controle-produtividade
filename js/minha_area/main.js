window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    usuarioAlvo: 'todos',
    
    get supabase() { return window.Sistema ? window.Sistema.supabase : (window._supabase || null); }
};

MinhaArea.init = async function() {
    const storedUser = localStorage.getItem('usuario_logado');
    if (!storedUser && !window.location.pathname.includes('index.html')) return;
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        const isUserAdmin = MinhaArea.user.funcao === 'GESTORA' || MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;
        
        const lastAlvo = localStorage.getItem('ma_lastUserAlvo');
        if (isUserAdmin) {
            MinhaArea.usuarioAlvo = lastAlvo && lastAlvo !== 'null' ? lastAlvo : 'todos';
        } else {
            MinhaArea.usuarioAlvo = MinhaArea.user.id;
        }
    }

    if (window.Sistema && !window.Sistema.supabase) await window.Sistema.inicializar(false);

    // Filtro Unificado
    const lastType = localStorage.getItem('ma_filter_type') || 'mes';
    const lastValue = localStorage.getItem('ma_filter_value');
    const selectType = document.getElementById('filtro-tipo');
    if (selectType) {
        selectType.value = lastType;
        MinhaArea.mudarTipoFiltro(lastType, lastValue);
    } else if (!MinhaArea.dataAtual) {
        MinhaArea.dataAtual = new Date();
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

MinhaArea.mudarTipoFiltro = function(tipo, valorSalvo = null) {
    const container = document.getElementById('filtro-valor-container');
    if (!container) return;

    localStorage.setItem('ma_filter_type', tipo);
    let html = '';
    const hoje = new Date();
    let defaultValue = valorSalvo;

    // Configura o input apropriado para cada tipo
    if (tipo === 'todos') {
        html = `<span class="text-xs font-bold text-slate-400 px-2">Todo o Histórico</span>`;
    } 
    else if (tipo === 'dia' || tipo === 'semana') {
        // Para semana, escolhemos um dia de referência
        if (!defaultValue) defaultValue = hoje.toISOString().split('T')[0];
        html = `<input type="date" id="filtro-valor" value="${defaultValue}" onchange="MinhaArea.atualizarFiltroGlobal(this.value)" class="bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer w-[120px]">`;
    } 
    else if (tipo === 'mes' || tipo === 'trimestre' || tipo === 'semestre') {
        // Para trimestre/semestre, escolhemos um mês de referência
        if (!defaultValue) defaultValue = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
        html = `<input type="month" id="filtro-valor" value="${defaultValue}" onchange="MinhaArea.atualizarFiltroGlobal(this.value)" class="bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer w-[120px]">`;
    } 
    else if (tipo === 'ano') {
        if (!defaultValue) defaultValue = hoje.getFullYear();
        html = `<input type="number" id="filtro-valor" value="${defaultValue}" min="2020" max="2030" onchange="MinhaArea.atualizarFiltroGlobal(this.value)" class="bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer w-[60px]">`;
    }

    container.innerHTML = html;
    
    // Se for 'todos', dispara atualização imediata, senão espera change ou usa valor salvo
    if (tipo === 'todos') {
        MinhaArea.atualizarFiltroGlobal('todos');
    } else if (!valorSalvo) {
        const input = document.getElementById('filtro-valor');
        if (input) MinhaArea.atualizarFiltroGlobal(input.value);
    }
};

MinhaArea.atualizarFiltroGlobal = function(val) {
    if (!val) return;
    localStorage.setItem('ma_filter_value', val);
    
    // Atualiza Data Global para compatibilidade
    if (val !== 'todos') {
        if (val.length === 10) { const [y, m, d] = val.split('-').map(Number); MinhaArea.dataAtual = new Date(y, m-1, d, 12, 0, 0); }
        else if (val.length === 7) { const [y, m] = val.split('-').map(Number); MinhaArea.dataAtual = new Date(y, m-1, 1, 12, 0, 0); }
        else if (val.length === 4) { MinhaArea.dataAtual = new Date(Number(val), 0, 1, 12, 0, 0); }
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
        
        if (MinhaArea.usuarioAlvo && MinhaArea.usuarioAlvo !== 'todos') {
             const exists = Array.from(selectElement.options).some(o => o.value == MinhaArea.usuarioAlvo);
             selectElement.value = exists ? MinhaArea.usuarioAlvo : 'todos';
        } else {
            selectElement.value = 'todos';
        }

    } catch (err) { console.error(err); }
};

MinhaArea.mudarUsuarioAlvo = function(val) {
    MinhaArea.usuarioAlvo = val;
    localStorage.setItem('ma_lastUserAlvo', val);

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

// CÁLCULO INTELIGENTE DE DATAS
MinhaArea.getPeriodo = function() {
    const tipo = document.getElementById('filtro-tipo')?.value || 'mes';
    const val = document.getElementById('filtro-valor')?.value;
    
    let inicio = '', fim = '', texto = '';

    if (!val && tipo !== 'todos') { 
        const h = new Date(); inicio = h.toISOString().split('T')[0]; fim = inicio; 
    } else {
        if (tipo === 'dia') {
            inicio = val; fim = val;
            const d = new Date(val + 'T12:00:00');
            texto = d.toLocaleDateString('pt-BR');
        } 
        else if (tipo === 'semana') {
            // Calcula seg-dom da data selecionada
            const d = new Date(val + 'T12:00:00');
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajuste para segunda
            const seg = new Date(d.setDate(diff));
            const dom = new Date(d.setDate(diff + 6));
            inicio = seg.toISOString().split('T')[0];
            fim = dom.toISOString().split('T')[0];
            texto = `Semana ${inicio.split('-').reverse().join('/')} à ${fim.split('-').reverse().join('/')}`;
        }
        else if (tipo === 'mes') {
            const [y, m] = val.split('-').map(Number);
            inicio = `${y}-${String(m).padStart(2,'0')}-01`;
            const lastDay = new Date(y, m, 0).getDate();
            fim = `${y}-${String(m).padStart(2,'0')}-${lastDay}`;
            texto = new Date(y, m-1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        } 
        else if (tipo === 'trimestre') {
            const [y, m] = val.split('-').map(Number);
            const q = Math.floor((m-1) / 3);
            inicio = `${y}-${String((q*3)+1).padStart(2,'0')}-01`;
            const endMonth = (q*3)+3;
            const lastDay = new Date(y, endMonth, 0).getDate();
            fim = `${y}-${String(endMonth).padStart(2,'0')}-${lastDay}`;
            texto = `${q+1}º Trimestre de ${y}`;
        }
        else if (tipo === 'semestre') {
            const [y, m] = val.split('-').map(Number);
            const s = (m-1) < 6 ? 0 : 1; // 0 = H1, 1 = H2
            inicio = `${y}-${String((s*6)+1).padStart(2,'0')}-01`;
            const endMonth = (s*6)+6;
            const lastDay = new Date(y, endMonth, 0).getDate();
            fim = `${y}-${String(endMonth).padStart(2,'0')}-${lastDay}`;
            texto = `${s+1}º Semestre de ${y}`;
        }
        else if (tipo === 'ano') {
            inicio = `${val}-01-01`; fim = `${val}-12-31`; texto = `Ano ${val}`;
        }
        else if (tipo === 'todos') {
            inicio = '2020-01-01'; fim = new Date().toISOString().split('T')[0]; texto = 'Todo o Histórico';
        }
    }
    
    // Capitalize texto
    if(texto) texto = texto.charAt(0).toUpperCase() + texto.slice(1);

    return { inicio, fim, texto, tipo };
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);