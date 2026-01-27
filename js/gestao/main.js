window.Gestao = window.Gestao || {};

Gestao.init = async function() {
    // 1. Garante dependências do Supabase
    if (!Sistema.supabase) await Sistema.inicializar(false);
    
    // 2. Verifica Sessão
    const sessao = localStorage.getItem('usuario_logado');
    if (!sessao) {
        window.location.href = 'index.html';
        return;
    }
    
    const user = JSON.parse(sessao);

    // --- CORREÇÃO DA VALIDAÇÃO DE ACESSO ---
    // Normaliza tudo para minúsculo para a comparação funcionar sempre
    const perfil = (user.perfil || '').toLowerCase().trim();
    const funcao = (user.funcao || '').toLowerCase().trim();
    const id = parseInt(user.id);

    // Regra de Ouro: Quem entra?
    // Adicionei 'gestor' (genérico) e o ID 1000 explicitamente
    const temAcesso = 
        perfil === 'admin' || 
        perfil === 'administrador' ||
        funcao.includes('gestor') || 
        funcao.includes('auditor') || 
        id === 1 || 
        id === 1000;

    if (!temAcesso) {
        console.warn("🚫 Bloqueio de Segurança. Usuário:", user.nome, "| Perfil:", perfil);
        alert("Acesso restrito ao Painel de Gestão."); 
        window.location.href = 'minha_area.html'; 
        return;
    }

    console.log("✅ Gestão Iniciada. Bem-vindo(a),", user.nome);

    // 3. Renderiza o Menu Superior (Se o script do menu estiver carregado)
    if (window.Menu && Menu.Gestao) {
        Menu.Gestao.renderizar();
    }

    // 4. Restaura a última aba acessada
    const ultimaAba = localStorage.getItem('gestao_aba_ativa') || 'usuarios';
    
    // Delay técnico para garantir que o DOM do menu existe
    setTimeout(() => {
        Gestao.mudarAba(ultimaAba);
    }, 50);
};

Gestao.mudarAba = function(aba) {
    // Salva estado
    localStorage.setItem('gestao_aba_ativa', aba);

    // --- ATUALIZAÇÃO VISUAL DO MENU ---
    // Limpa todos os botões (remove estilo ativo)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200');
        btn.classList.add('text-slate-600', 'hover:bg-slate-50');
    });

    // Ativa o botão clicado (Usa o ID correto 'btn-g-...')
    const btnAtivo = document.getElementById(`btn-g-${aba}`);
    if (btnAtivo) {
        btnAtivo.classList.remove('text-slate-600', 'hover:bg-slate-50');
        btnAtivo.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
    }

    // Atualiza Botões de Ação (Canto direito)
    if (window.Menu && Menu.Gestao) {
        Menu.Gestao.atualizarAcao(aba);
    }

    // --- TROCA DE TELAS ---
    document.querySelectorAll('.gestao-view').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(`view-${aba}`);
    if (view) view.classList.remove('hidden');

    // --- CARREGAMENTO DE DADOS ---
    // Só carrega se o módulo existir
    switch(aba) {
        case 'usuarios':
            if (Gestao.Usuarios) Gestao.Usuarios.carregar();
            break;
        case 'empresas':
            if (Gestao.Empresas) Gestao.Empresas.carregar();
            break;
        case 'assertividade':
            if (Gestao.Assertividade) Gestao.Assertividade.carregar();
            break;
        case 'metas':
            if (Gestao.Metas) Gestao.Metas.carregar();
            break;
    }
};

// Helper Universal para ler CSV/Excel
Gestao.lerArquivo = async function(file) {
    return new Promise((resolve, reject) => {
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (ext === 'csv') {
            Papa.parse(file, { 
                header: true, 
                skipEmptyLines: true, 
                encoding: "UTF-8", // Força UTF-8 para acentos
                complete: (res) => resolve(res.data), 
                error: reject 
            });
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    // Pega a primeira aba da planilha
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    resolve(XLSX.utils.sheet_to_json(firstSheet));
                } catch(err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        }
    });
};

// Inicia
document.addEventListener('DOMContentLoaded', Gestao.init);