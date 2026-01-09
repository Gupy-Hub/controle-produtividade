window.Gestao = window.Gestao || {};

Gestao.init = async function() {
    await Sistema.inicializar();
    const user = Sistema.usuarioLogado;
    
    // Verificação de segurança
    if (!user || (user.funcao !== 'GESTORA' && user.funcao !== 'AUDITORA' && user.id != 1)) {
        alert("Acesso restrito."); window.location.href = 'minha_area.html'; return;
    }

    // 1. Renderiza o Sub-Menu
    if(Menu.Gestao) Menu.Gestao.renderizar();

    // 2. Recupera a última aba acessada (ou usa 'usuarios' como padrão)
    const ultimaAba = localStorage.getItem('gestao_aba_ativa') || 'usuarios';
    Gestao.mudarAba(ultimaAba);
};

Gestao.mudarAba = function(aba) {
    // Salva a escolha no navegador
    localStorage.setItem('gestao_aba_ativa', aba);

    // Esconde todas as views
    document.querySelectorAll('.gestao-view').forEach(el => el.classList.add('hidden'));

    // Mostra a view selecionada
    const view = document.getElementById(`view-${aba}`);
    if (view) view.classList.remove('hidden');

    // Atualiza o Sub-Menu (Botão e Abas ativas)
    if(Menu.Gestao) Menu.Gestao.atualizarAcao(aba);

    // Carrega dados específicos
    if (aba === 'usuarios' && Gestao.Usuarios) Gestao.Usuarios.carregar();
    else if (aba === 'empresas' && Gestao.Empresas) Gestao.Empresas.carregar();
    else if (aba === 'assertividade' && Gestao.Assertividade) Gestao.Assertividade.carregar();
    else if (aba === 'metas' && Gestao.Metas) Gestao.Metas.carregar();
};

// Utilitário de leitura de arquivo (mantido igual)
Gestao.lerArquivo = async function(file) {
    return new Promise((resolve, reject) => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => resolve(res.data), error: reject });
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
            };
            reader.readAsArrayBuffer(file);
        }
    });
};

document.addEventListener('DOMContentLoaded', Gestao.init);