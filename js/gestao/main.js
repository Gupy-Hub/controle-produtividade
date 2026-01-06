// Define o objeto globalmente de forma segura
window.Gestao = window.Gestao || {
    supabase: null,
    dados: { usuarios: [], empresas: [] }
};

Gestao.init = async function() {
    // 1. Configuração do Supabase (Reutiliza ou cria)
    if (window._supabase) {
        Gestao.supabase = window._supabase;
    } else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        Gestao.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = Gestao.supabase;
    } else {
        console.error("Supabase não configurado.");
        return; // Para aqui se não tiver banco, mas não quebra o JS
    }

    // 2. Define datas nos inputs (com verificação de segurança)
    const today = new Date().toISOString().substring(0, 10);
    const inputsData = ['meta-date', 'assert-date', 'form-empresa-data'];
    
    inputsData.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today; // SÓ TENTA DEFINIR SE O ELEMENTO EXISTIR
    });

    // 3. Carrega os módulos (se existirem)
    if(Gestao.Equipe) await Gestao.Equipe.carregar();
    if(Gestao.Empresas) await Gestao.Empresas.carregar();
    if(Gestao.Producao) await Gestao.Producao.carregar();
    if(Gestao.Assertividade) await Gestao.Assertividade.carregar();

    // 4. Inicia na aba padrão
    Gestao.mudarAba('equipe');
};

Gestao.mudarAba = function(aba) {
    // Esconde todas as seções
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Mostra a selecionada (se existir)
    const tab = document.getElementById(`tab-${aba}`);
    const btn = document.getElementById(`btn-${aba}`);
    
    if (tab) tab.classList.remove('hidden');
    if (btn) btn.classList.add('active');
};

Gestao.fecharModais = function() {
    const modalUser = document.getElementById('modal-user');
    const modalEmpresa = document.getElementById('modal-empresa');
    if(modalUser) modalUser.classList.add('hidden');
    if(modalEmpresa) modalEmpresa.classList.add('hidden');
};

// Inicializa apenas quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', Gestao.init);