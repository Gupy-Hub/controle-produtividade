window.Gestao = window.Gestao || {};

Gestao.init = async function() {
    // 1. Inicializa Sistema Base
    if (!Sistema.supabase) await Sistema.inicializar(false);
    
    // 2. Validação de Segurança
    const sessao = localStorage.getItem('usuario_logado');
    if (!sessao) {
        window.location.href = 'index.html';
        return;
    }
    
    const user = JSON.parse(sessao);
    // Permite Gestora, Auditora, Admin ou ID 1
    const allowed = ['GESTORA', 'AUDITORA'].includes((user.funcao || '').toUpperCase()) 
                    || user.perfil === 'admin' 
                    || user.id == 1;

    if (!allowed) {
        alert("Acesso restrito."); 
        window.location.href = 'minha_area.html'; 
        return;
    }

    console.log("Gestão Iniciada - v2.0 (SPA Mode)");

    // 3. Renderiza o Menu Dinâmico (Evita duplicação com o HTML antigo)
    if (window.Menu && Menu.Gestao) {
        Menu.Gestao.renderizar();
    }

    // 4. Restaura Aba e Inicializa Listeners
    const ultimaAba = localStorage.getItem('gestao_aba_ativa') || 'usuarios';
    
    // Inicializa listeners específicos se necessário
    if(Gestao.Assertividade && Gestao.Assertividade.initListeners) {
        Gestao.Assertividade.initListeners();
    }

    // Delay para garantir que o DOM do menu existe
    setTimeout(() => {
        Gestao.mudarAba(ultimaAba);
    }, 50);
};

Gestao.mudarAba = function(aba) {
    // A. Salva estado
    localStorage.setItem('gestao_aba_ativa', aba);

    // B. Atualiza Visual dos Botões (Menu Dinâmico)
    // Remove active de todos
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-600', 'active');
        btn.classList.add('text-slate-600');
    });

    // Ativa o atual (tenta achar pelo ID dinâmico gerado em menu/gestao.js)
    const btnAtivo = document.getElementById(`btn-g-${aba}`);
    if (btnAtivo) {
        btnAtivo.classList.remove('text-slate-600');
        btnAtivo.classList.add('bg-blue-50', 'text-blue-700');
    }

    // C. Atualiza Botão de Ação (Importar CSV) no Menu
    if (window.Menu && Menu.Gestao && Menu.Gestao.atualizarAcao) {
        Menu.Gestao.atualizarAcao(aba);
    }

    // D. Troca a View (Conteúdo da página)
    document.querySelectorAll('.gestao-view').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(`view-${aba}`);
    if (view) view.classList.remove('hidden');

    // E. Carrega os Dados da Aba
    if (aba === 'usuarios' && Gestao.Usuarios) Gestao.Usuarios.carregar();
    else if (aba === 'empresas' && Gestao.Empresas) Gestao.Empresas.carregar();
    else if (aba === 'assertividade' && Gestao.Assertividade) Gestao.Assertividade.carregar();
    else if (aba === 'metas' && Gestao.Metas) Gestao.Metas.carregar();
};

// Helper Global de Leitura de Arquivos
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