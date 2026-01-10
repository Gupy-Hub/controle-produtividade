window.Gestao = window.Gestao || {};

Gestao.init = async function() {
    // Garante que o sistema base rodou
    if (!Sistema.supabase) await Sistema.inicializar(false);
    
    const sessao = localStorage.getItem('usuario_logado');
    if (!sessao) {
        window.location.href = 'index.html';
        return;
    }
    
    const user = JSON.parse(sessao);
    // Validação extra de acesso
    if (user.funcao !== 'GESTORA' && user.funcao !== 'AUDITORA' && user.id != 1 && user.perfil !== 'admin') {
        alert("Acesso restrito."); 
        window.location.href = 'minha_area.html'; 
        return;
    }

    console.log("Módulo Gestão Iniciado (App Unificado)");

    // LÓGICA DE PERSISTÊNCIA DA ABA
    const ultimaAba = localStorage.getItem('gestao_aba_ativa') || 'usuarios';
    
    // Pequeno delay para garantir renderização
    setTimeout(() => {
        Gestao.mudarAba(ultimaAba);
    }, 50);
};

Gestao.mudarAba = function(aba) {
    // 1. Salva a escolha
    localStorage.setItem('gestao_aba_ativa', aba);

    // 2. Atualiza Interface (Botões)
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const btnAtivo = document.getElementById(`btn-${aba}`);
    if (btnAtivo) btnAtivo.classList.add('active');

    // 3. Atualiza Interface (Views)
    document.querySelectorAll('.gestao-view').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(`view-${aba}`);
    if (view) view.classList.remove('hidden');

    // 4. Carrega Dados
    if (aba === 'usuarios' && Gestao.Usuarios) Gestao.Usuarios.carregar();
    else if (aba === 'empresas' && Gestao.Empresas) Gestao.Empresas.carregar();
    else if (aba === 'assertividade' && Gestao.Assertividade) Gestao.Assertividade.carregar();
    else if (aba === 'metas' && Gestao.Metas) Gestao.Metas.carregar();
};

// Helper de leitura de arquivos (CSV/Excel)
Gestao.lerArquivo = async function(file) {
    return new Promise((resolve, reject) => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => resolve(res.data), error: reject });
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