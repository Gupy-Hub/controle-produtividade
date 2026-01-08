window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    usuarioAlvo: null, // ID do usuário que está sendo visualizado (pode ser diferente do user logado)
    
    get supabase() {
        return window.Sistema ? window.Sistema.supabase : (window._supabase || null);
    }
};

MinhaArea.init = async function() {
    const storedUser = localStorage.getItem('usuario_logado');
    if (!storedUser && !window.location.pathname.includes('index.html')) {
        console.warn("MinhaArea: Usuário não logado.");
        return; 
    }
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        
        // Define o alvo inicial como o próprio usuário
        MinhaArea.usuarioAlvo = MinhaArea.user.id;
        
        const elRole = document.getElementById('user-role-label');
        if(elRole) elRole.innerText = `${MinhaArea.user.nome.split(' ')[0]} • ${MinhaArea.user.cargo || MinhaArea.user.funcao || 'User'}`;
    }

    if (window.Sistema && !window.Sistema.supabase) {
        await window.Sistema.inicializar(false);
    }

    const dateInput = document.getElementById('ma-global-date');
    if (dateInput) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        const dd = String(hoje.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        MinhaArea.dataAtual = hoje;
    }
    
    // --- LÓGICA DE ADMIN / GESTOR ---
    // Se for Admin/Gestora, mostra seletor de usuários
    const cargo = MinhaArea.user.cargo ? MinhaArea.user.cargo.toUpperCase() : '';
    const isAdmin = cargo === 'GESTORA' || cargo === 'AUDITORA' || cargo === 'ADMINISTRADOR' || MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;

    if (isAdmin) {
        const controls = document.getElementById('admin-controls');
        const select = document.getElementById('admin-user-select');
        if(controls && select) {
            controls.classList.remove('hidden');
            await MinhaArea.carregarListaUsuarios(select);
        }
    }

    MinhaArea.mudarAba('diario');
};

MinhaArea.carregarListaUsuarios = async function(selectElement) {
    try {
        // Busca todos os assistentes ativos
        const { data, error } = await MinhaArea.supabase
            .from('usuarios')
            .select('id, nome')
            .eq('perfil', 'assistente')
            .eq('ativo', true)
            .order('nome');

        if(error) throw error;

        selectElement.innerHTML = '<option value="">Selecione um usuário...</option>';
        data.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.innerText = u.nome;
            selectElement.appendChild(opt);
        });
        
        // Se eu sou admin, não quero me ver (não tenho dados). Seleciona o primeiro da lista.
        if (data.length > 0) {
            // Se o usuarioAlvo atual for eu mesmo (Admin), muda para o primeiro assistente
            if (String(MinhaArea.usuarioAlvo) === String(MinhaArea.user.id)) {
                MinhaArea.usuarioAlvo = data[0].id;
                selectElement.value = data[0].id;
            } else {
                selectElement.value = MinhaArea.usuarioAlvo;
            }
        }

    } catch (err) {
        console.error("Erro ao carregar usuários:", err);
        selectElement.innerHTML = '<option value="">Erro ao carregar</option>';
    }
};

MinhaArea.mudarUsuarioAlvo = function(id) {
    if (!id) return;
    MinhaArea.usuarioAlvo = id;
    
    // Recarrega a aba ativa para refletir os dados do novo usuário
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        const abaAtiva = activeBtn.id.replace('btn-ma-', '');
        MinhaArea.mudarAba(abaAtiva);
    }
};

MinhaArea.atualizarDataGlobal = function(val) {
    if (!val) return;
    const [ano, mes, dia] = val.split('-').map(Number);
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