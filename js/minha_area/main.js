window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    usuarioAlvo: null, 
    
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
        // Exibe Funcao (ex: Assistente/Gestora) no topo
        if(elRole) elRole.innerText = `${MinhaArea.user.nome.split(' ')[0]} • ${MinhaArea.user.funcao || MinhaArea.user.cargo || 'User'}`;
    }

    // Inicializa Supabase
    if (window.Sistema && !window.Sistema.supabase) {
        await window.Sistema.inicializar(false);
    }

    // Define Data Hoje
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
    // Verifica se é Gestora, Auditora ou ID 1000 (Admin)
    const funcao = MinhaArea.user.funcao ? MinhaArea.user.funcao.toUpperCase() : '';
    const cargo = MinhaArea.user.cargo ? MinhaArea.user.cargo.toUpperCase() : '';
    
    // Permite acesso ao seletor se for Gestora, Auditora ou Admin
    const isAdmin = funcao === 'GESTORA' || funcao === 'AUDITORA' || 
                    cargo === 'GESTORA' || cargo === 'AUDITORA' || 
                    MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;

    if (isAdmin) {
        const controls = document.getElementById('admin-controls');
        const select = document.getElementById('admin-user-select');
        
        if(controls && select) {
            controls.classList.remove('hidden');
            // Chama a função corrigida para buscar usuarios
            await MinhaArea.carregarListaUsuarios(select);
        }
    }

    MinhaArea.mudarAba('diario');
};

MinhaArea.carregarListaUsuarios = async function(selectElement) {
    try {
        if (!MinhaArea.supabase) {
            console.error("Supabase não disponível para carregar usuários.");
            return;
        }

        // --- CORREÇÃO AQUI ---
        // Busca na coluna 'funcao' em vez de 'perfil', pois é onde o Gestao.Equipe salva "Assistente"
        const { data, error } = await MinhaArea.supabase
            .from('usuarios')
            .select('id, nome')
            .eq('funcao', 'Assistente') // Corrigido de 'perfil' para 'funcao'
            .eq('ativo', true)
            .order('nome');

        if(error) throw error;

        selectElement.innerHTML = '<option value="">Selecione um assistente...</option>';
        
        if (data && data.length > 0) {
            data.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.innerText = u.nome;
                selectElement.appendChild(opt);
            });

            // Se eu sou o Admin (ID 1000 ou sem dados proprios), seleciono o primeiro da lista automaticamente
            if (String(MinhaArea.usuarioAlvo) === String(MinhaArea.user.id)) {
                // Se eu não sou um assistente (sou gestor), mudo o alvo para o primeiro assistente da lista
                if (MinhaArea.user.funcao !== 'Assistente') {
                    MinhaArea.usuarioAlvo = data[0].id;
                    selectElement.value = data[0].id;
                }
            } else {
                // Mantém o selecionado
                selectElement.value = MinhaArea.usuarioAlvo;
            }
        } else {
            selectElement.innerHTML = '<option value="">Nenhum assistente ativo</option>';
        }

    } catch (err) {
        console.error("Erro ao carregar usuários:", err);
        selectElement.innerHTML = '<option value="">Erro ao carregar</option>';
    }
};

MinhaArea.mudarUsuarioAlvo = function(id) {
    if (!id) return;
    MinhaArea.usuarioAlvo = id;
    
    // Recarrega a aba ativa para buscar os dados do novo ID
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

    // Módulos
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