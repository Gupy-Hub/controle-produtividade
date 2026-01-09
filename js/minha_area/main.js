window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    usuarioAlvo: 'todos', // Padrão inicial alterado para facilitar
    
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
        // Se não houver alvo definido, usa o próprio ID (ou 'todos' se for definido na lógica abaixo)
        MinhaArea.usuarioAlvo = MinhaArea.user.id;
    }

    // 2. Inicializa Supabase
    if (window.Sistema && !window.Sistema.supabase) {
        await window.Sistema.inicializar(false);
    }

    // 3. DATA GLOBAL
    const dateInput = document.getElementById('ma-global-date');
    const lastDate = localStorage.getItem('ma_lastGlobalDate');

    if (dateInput) {
        if (lastDate) {
            dateInput.value = lastDate;
            const [ano, mes, dia] = lastDate.split('-').map(Number);
            MinhaArea.dataAtual = new Date(ano, mes - 1, dia, 12, 0, 0);
        } else {
            const hoje = new Date();
            const yyyy = hoje.getFullYear();
            const mm = String(hoje.getMonth() + 1).padStart(2, '0');
            const dd = String(hoje.getDate()).padStart(2, '0');
            const hojeStr = `${yyyy}-${mm}-${dd}`;
            
            dateInput.value = hojeStr;
            MinhaArea.dataAtual = hoje;
            localStorage.setItem('ma_lastGlobalDate', hojeStr);
        }
    }
    
    // 4. ADMIN / GESTOR
    const funcao = MinhaArea.user.funcao ? MinhaArea.user.funcao.toUpperCase() : '';
    const cargo = MinhaArea.user.cargo ? MinhaArea.user.cargo.toUpperCase() : '';
    
    const isAdmin = funcao === 'GESTORA' || funcao === 'AUDITORA' || 
                    cargo === 'GESTORA' || cargo === 'AUDITORA' || 
                    MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;

    if (isAdmin) {
        const controls = document.getElementById('admin-controls');
        const select = document.getElementById('admin-user-select');
        const btnImport = document.getElementById('btn-importar-container');
        
        if(controls && select) {
            controls.classList.remove('hidden');
            await MinhaArea.carregarListaUsuarios(select);
        }

        if(btnImport) btnImport.classList.remove('hidden');
    }

    // 5. RECUPERA ABA
    const lastTab = localStorage.getItem('ma_lastActiveTab');
    if (lastTab) {
        MinhaArea.mudarAba(lastTab);
    } else {
        MinhaArea.mudarAba('diario');
    }
};

MinhaArea.carregarListaUsuarios = async function(selectElement) {
    try {
        if (!MinhaArea.supabase) return;

        const { data, error } = await MinhaArea.supabase
            .from('usuarios')
            .select('id, nome')
            .eq('funcao', 'Assistente')
            .eq('ativo', true)
            .order('nome');

        if(error) throw error;

        // Opção padrão para ver todo o time
        selectElement.innerHTML = '<option value="todos">Toda a Equipe</option>';
        
        if (data && data.length > 0) {
            data.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.innerText = u.nome;
                selectElement.appendChild(opt);
            });

            // Se for admin/gestor e ainda estiver apontando para si mesmo (ID 1000 etc), muda para 'todos'
            // Se já tiver um assistente selecionado (navegação persistente), mantem.
            if (MinhaArea.usuarioAlvo === MinhaArea.user.id && MinhaArea.user.funcao !== 'Assistente') {
                MinhaArea.usuarioAlvo = 'todos';
            }
            
            selectElement.value = MinhaArea.usuarioAlvo;
        } 

    } catch (err) {
        console.error("Erro ao carregar usuários:", err);
    }
};

MinhaArea.mudarUsuarioAlvo = function(id) {
    if (!id) return;
    MinhaArea.usuarioAlvo = id;
    
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        const abaAtiva = activeBtn.id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    }
};

MinhaArea.atualizarDataGlobal = function(val) {
    if (!val) return;
    
    localStorage.setItem('ma_lastGlobalDate', val);

    const [ano, mes, dia] = val.split('-').map(Number);
    MinhaArea.dataAtual = new Date(ano, mes - 1, dia, 12, 0, 0);

    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        const abaAtiva = activeBtn.id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
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

    // CONTROLES DO CABEÇALHO
    const dateGlobal = document.getElementById('container-data-global');
    const okrControls = document.getElementById('okr-header-controls');

    if (aba === 'evolucao') {
        if(dateGlobal) dateGlobal.classList.remove('hidden'); 
        if(okrControls) okrControls.classList.remove('hidden');
    } else if (aba === 'diario') {
        if(dateGlobal) dateGlobal.classList.remove('hidden');
        if(okrControls) okrControls.classList.add('hidden');
    } else {
        if(dateGlobal) dateGlobal.classList.remove('hidden');
        if(okrControls) okrControls.classList.add('hidden');
    }

    // Carrega Módulos
    if (aba === 'diario') {
        if(MinhaArea.Diario) MinhaArea.Diario.carregar();
    }
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