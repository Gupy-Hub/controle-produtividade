window.Gestao = window.Gestao || {};

Gestao.init = async function() {
    // 1. Garante dependências
    if (!Sistema.supabase) await Sistema.inicializar(false);
    
    // 2. Verifica Sessão
    const sessao = localStorage.getItem('usuario_logado');
    if (!sessao) {
        window.location.href = 'index.html';
        return;
    }
    
    const user = JSON.parse(sessao);

    // --- CORREÇÃO CRÍTICA DE ACESSO ---
    // Normaliza textos para evitar erro de 'ADMIN' vs 'admin'
    const perfil = (user.perfil || '').toLowerCase().trim();
    const funcao = (user.funcao || '').toLowerCase().trim();
    const id = parseInt(user.id);

    // Lista VIP de Acesso
    const temAcesso = 
        perfil === 'admin' || 
        perfil === 'administrador' ||
        funcao.includes('gestor') || 
        funcao.includes('auditor') || 
        id === 1 || 
        id === 1000; // <--- LIBERA O SUPER ADMIN

    if (!temAcesso) {
        console.warn("🚫 Acesso Negado. Perfil:", perfil, "ID:", id);
        alert("Acesso restrito. Redirecionando..."); 
        window.location.href = 'minha_area.html'; 
        return;
    }

    console.log("✅ Gestão Iniciada. Usuário:", user.nome);

    // 3. Renderiza Menu
    if (window.Menu && Menu.Gestao) Menu.Gestao.renderizar();

    // 4. Carrega Aba
    const ultimaAba = localStorage.getItem('gestao_aba_ativa') || 'usuarios';
    setTimeout(() => Gestao.mudarAba(ultimaAba), 50);
};

Gestao.mudarAba = function(aba) {
    localStorage.setItem('gestao_aba_ativa', aba);

    // Atualiza Botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-blue-50', 'text-blue-700');
        btn.classList.add('text-slate-600');
    });
    const btnAtivo = document.getElementById(aba.startsWith('btn-') ? aba : `btn-${aba}`); // Suporta ID completo ou sufixo
    if (btnAtivo) btnAtivo.classList.add('active', 'bg-blue-50', 'text-blue-700');

    // Atualiza Views
    document.querySelectorAll('.gestao-view').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(`view-${aba}`);
    if (view) view.classList.remove('hidden');

    // Atualiza Ações do Menu (se existir)
    if (window.Menu && Menu.Gestao) Menu.Gestao.atualizarAcao(aba);

    // Carrega Dados
    if (aba === 'usuarios' && Gestao.Usuarios) Gestao.Usuarios.carregar();
    else if (aba === 'empresas' && Gestao.Empresas) Gestao.Empresas.carregar();
    else if (aba === 'assertividade' && Gestao.Assertividade) Gestao.Assertividade.carregar();
    else if (aba === 'metas' && Gestao.Metas) Gestao.Metas.carregar();
};

// Helper Universal
Gestao.lerArquivo = async function(file) {
    return new Promise((resolve, reject) => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            Papa.parse(file, { header: true, skipEmptyLines: true, encoding: "UTF-8", complete: (res) => resolve(res.data), error: reject });
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    resolve(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
                } catch(err) { reject(err); }
            };
            reader.readAsArrayBuffer(file);
        }
    });
};

document.addEventListener('DOMContentLoaded', Gestao.init);