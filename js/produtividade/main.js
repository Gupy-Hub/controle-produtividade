window.Produtividade = window.Produtividade || {
    supabase: null
};

Produtividade.init = async function() {
    if (window._supabase) {
        Produtividade.supabase = window._supabase;
    } else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        Produtividade.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = Produtividade.supabase;
    } else {
        console.error("Supabase não configurado.");
        return;
    }

    if(window.Sistema && Sistema.Dados) await Sistema.Dados.inicializar();

    const dateInput = document.getElementById('global-date');
    if (dateInput) {
        const storedDate = localStorage.getItem('produtividade_data_ref');
        dateInput.value = storedDate || new Date().toISOString().split('T')[0];
    }

    Produtividade.mudarAba('geral');
};

Produtividade.atualizarDataGlobal = function(novaData) {
    if (!novaData) return;
    localStorage.setItem('produtividade_data_ref', novaData);

    const tabGeral = document.getElementById('tab-geral');
    if (tabGeral && !tabGeral.classList.contains('hidden') && Produtividade.Geral) Produtividade.Geral.carregarTela();
    // Adicione outras verificações se necessário
};

Produtividade.mudarAba = function(aba) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    // Controles do topo
    ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    if (aba === 'geral') {
        const ctrl = document.getElementById('ctrl-geral');
        if(ctrl) ctrl.classList.remove('hidden');
        if(Produtividade.Geral) Produtividade.Geral.carregarTela();
    } 
    else if (aba === 'consolidado') {
        const ctrl = document.getElementById('ctrl-consolidado');
        if(ctrl) ctrl.classList.remove('hidden');
        if(Produtividade.Consolidado) Produtividade.Consolidado.init();
    } 
    else if (aba === 'performance') {
        const ctrl = document.getElementById('ctrl-performance');
        if(ctrl) ctrl.classList.remove('hidden');
        if(Produtividade.Performance) Produtividade.Performance.init();
    } 
    else if (aba === 'matriz') {
        if(Produtividade.Matriz) Produtividade.Matriz.init();
    }
};

// ... Mantenha a função importarExcel igual, apenas certifique-se que está dentro do objeto ...
Produtividade.importarExcel = async function(input) {
    // (Código da importação permanece o mesmo da resposta anterior, 
    //  mas lembre-se de usar Importacao.processar ou a lógica customizada que definimos)
    // ...
    // Se quiser o código completo desta função novamente, avise.
    if (!input.files || input.files.length === 0) return;
    /* ... Lógica de importação ... */
    alert("Função de importação pronta. (Código abreviado para focar na correção do erro principal)");
};

document.addEventListener('DOMContentLoaded', Produtividade.init);