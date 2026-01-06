window.Produtividade = window.Produtividade || { supabase: null };

Produtividade.init = async function() {
    if (window._supabase) {
        Produtividade.supabase = window._supabase;
    } else if (window.supabase) {
        Produtividade.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = Produtividade.supabase;
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
    if (Produtividade.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) {
        Produtividade.Geral.carregarTela();
    }
};

Produtividade.mudarAba = function(aba) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    if (aba === 'geral') {
        document.getElementById('ctrl-geral').classList.remove('hidden');
        if(Produtividade.Geral) Produtividade.Geral.carregarTela();
    } 
    else if (aba === 'consolidado') {
        document.getElementById('ctrl-consolidado').classList.remove('hidden');
        if(Produtividade.Consolidado) Produtividade.Consolidado.init();
    } 
    else if (aba === 'performance') {
        document.getElementById('ctrl-performance').classList.remove('hidden');
        if(Produtividade.Performance) Produtividade.Performance.init();
    } 
    else if (aba === 'matriz') {
        if(Produtividade.Matriz) Produtividade.Matriz.init();
    }
};

// --- IMPORTAÇÃO EM MASSA CORRIGIDA ---
Produtividade.importarEmMassa = async function(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    if(!confirm(`Deseja importar ${files.length} arquivo(s)?`)) { input.value = ""; return; }

    // 1. Carrega Usuários para Mapeamento (Nome -> ID)
    const { data: usersDB } = await Produtividade.supabase.from('usuarios').select('id, nome');
    const mapUsuarios = {};
    const activeIds = new Set();
    
    (usersDB || []).forEach(u => {
        mapUsuarios[Importacao.normalizar(u.nome)] = u.id;
        activeIds.add(u.id);
    });

    let totalImportados = 0;
    let arquivosProcessados = 0;
    let erros = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const leitura = await Importacao.lerArquivo(file);
            
            // Lógica de Data: Prioriza nome do arquivo, senão usa painel
            let dataRef = leitura.dataSugestionada;
            if (!dataRef) dataRef = document.getElementById('global-date').value;

            const updates = [];
            
            leitura.dados.forEach(row => {
                const keys = Object.keys(row);
                const norm = Importacao.normalizar;
                const getKey = (term) => keys.find(k => k.trim() === term || norm(k) === term || norm(k).includes(term));
                
                // Mapeamento baseado no seu CSV (05012026.xlsx)
                const kNome = getKey('assistente');
                const kId = getKey('id_assistente');
                
                // Ignora linha de "Total"
                if (!kNome && !kId) return;
                const nomeVal = row[kNome] ? row[kNome].toString() : '';
                if (nomeVal.toLowerCase().includes('total')) return;

                // Colunas de Valores
                const kTotal = keys.find(k => k.trim() === 'documentos_validados') || getKey('total'); // Prioriza nome exato
                const kFifo = keys.find(k => k.trim() === 'documentos_validados_fifo') || getKey('fifo');
                const kGT = keys.find(k => k.trim() === 'documentos_validados_gradual_total') || getKey('gradual_total');
                const kGP = keys.find(k => k.trim() === 'documentos_validados_gradual_parcial') || getKey('gradual_parcial');
                const kPFC = keys.find(k => k.trim() === 'documentos_validados_perfil_fc') || getKey('perfil_fc');

                let uid = null;
                // Tenta ID
                if (kId && row[kId]) {
                    const idVal = parseInt(row[kId]);
                    if (activeIds.has(idVal)) uid = idVal;
                }
                // Tenta Nome
                if (!uid && kNome && row[kNome]) {
                    uid = mapUsuarios[norm(row[kNome])];
                }

                if (uid) {
                    const pInt = (v) => {
                        if (typeof v === 'number') return v;
                        if (!v) return 0;
                        const s = v.toString().replace(/\./g, '').replace(',', '.'); // Remove ponto de milhar
                        return parseInt(s) || 0;
                    };

                    updates.push({
                        usuario_id: uid,
                        data_referencia: dataRef,
                        quantidade: pInt(row[kTotal]),
                        fifo: pInt(row[kFifo]),
                        gradual_total: pInt(row[kGT]),
                        gradual_parcial: pInt(row[kGP]),
                        perfil_fc: pInt(row[kPFC])
                    });
                }
            });

            if (updates.length > 0) {
                const { error } = await Produtividade.supabase
                    .from('producao')
                    .upsert(updates, { onConflict: 'usuario_id, data_referencia' });
                
                if (error) throw error;
                totalImportados += updates.length;
                arquivosProcessados++;
            }

        } catch (err) {
            console.error(`Erro arquivo ${file.name}:`, err);
            erros++;
        }
    }

    input.value = "";
    alert(`Finalizado!\n\nProcessados: ${arquivosProcessados}\nRegistros: ${totalImportados}\nErros: ${erros}`);
    
    if (Produtividade.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) {
        Produtividade.Geral.carregarTela();
    }
};

document.addEventListener('DOMContentLoaded', Produtividade.init);