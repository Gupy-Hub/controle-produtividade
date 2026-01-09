window.Gestao = window.Gestao || {};

Gestao.init = async function() {
    // Verifica permissão
    await Sistema.inicializar();
    const user = Sistema.usuarioLogado;
    if (!user || (user.funcao !== 'GESTORA' && user.funcao !== 'AUDITORA' && user.id != 1)) {
        alert("Acesso restrito.");
        window.location.href = 'minha_area.html';
        return;
    }

    // Carrega aba inicial (Usuários)
    Gestao.mudarAba('usuarios');
};

Gestao.mudarAba = function(aba) {
    // UI Updates
    document.querySelectorAll('.gestao-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const view = document.getElementById(`view-${aba}`);
    const btn = document.getElementById(`btn-g-${aba}`);
    
    if (view) view.classList.remove('hidden');
    if (btn) btn.classList.add('active');

    // Load Data
    if (aba === 'usuarios' && Gestao.Usuarios) Gestao.Usuarios.carregar();
    else if (aba === 'empresas' && Gestao.Empresas) Gestao.Empresas.carregar();
    else if (aba === 'assertividade' && Gestao.Assertividade) Gestao.Assertividade.carregar();
    else if (aba === 'metas' && Gestao.Metas) Gestao.Metas.carregar();
};

// Utils para importação (CSV/Excel)
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