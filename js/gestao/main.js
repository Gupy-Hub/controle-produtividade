window.Gestao = window.Gestao || {};

Gestao.init = async function() {
    if (!Sistema.supabase) await Sistema.inicializar(false);
    
    const sessao = localStorage.getItem('usuario_logado');
    if (!sessao) {
        window.location.href = 'index.html';
        return;
    }
    
    const user = JSON.parse(sessao);
    const allowed = ['GESTORA', 'AUDITORA'].includes((user.funcao || '').toUpperCase()) 
                    || user.perfil === 'admin' 
                    || user.id == 1;

    if (!allowed) {
        alert("Acesso restrito."); 
        window.location.href = 'minha_area.html'; 
        return;
    }

    if (window.Menu && Menu.Gestao) {
        Menu.Gestao.renderizar();
    }

    // Default para usuários agora que assertividade foi removida
    const ultimaAba = localStorage.getItem('gestao_aba_ativa');
    const abaInicial = (ultimaAba === 'assertividade' || !ultimaAba) ? 'usuarios' : ultimaAba;

    setTimeout(() => {
        Gestao.mudarAba(abaInicial);
    }, 50);
};

Gestao.mudarAba = function(aba) {
    localStorage.setItem('gestao_aba_ativa', aba);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-600', 'active');
        btn.classList.add('text-slate-600');
    });

    const btnAtivo = document.getElementById(`btn-g-${aba}`);
    if (btnAtivo) {
        btnAtivo.classList.remove('text-slate-600');
        btnAtivo.classList.add('bg-blue-50', 'text-blue-700');
    }

    document.querySelectorAll('.gestao-view').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(`view-${aba}`);
    if (view) view.classList.remove('hidden');

    // Chamadas de carregamento apenas para módulos ativos
    if (aba === 'usuarios' && Gestao.Usuarios) Gestao.Usuarios.carregar();
    else if (aba === 'empresas' && Gestao.Empresas) Gestao.Empresas.carregar();
    else if (aba === 'metas' && Gestao.Metas) Gestao.Metas.carregar();
};

document.addEventListener('DOMContentLoaded', Gestao.init);