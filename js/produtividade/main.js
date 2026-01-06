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

Produtividade.importarEmMassa = async function(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    if(!confirm(`Importar ${files.length} arquivo(s)?`)) { input.value = ""; return; }

    const { data: usersDB } = await Produtividade.supabase.from('usuarios').select('id, nome');
    const mapUsuarios = {};
    (usersDB || []).forEach(u => mapUsuarios[Importacao.normalizar(u.nome)] = u.id);

    let totalImportados = 0;
    let erros = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const leitura = await Importacao.lerArquivo(file);
            let dataRef = leitura.dataSugestionada || document.getElementById('global-date').value;
            const updates = [];
            
            leitura.dados.forEach(row => {
                const keys = Object.keys(row);
                const norm = Importacao.normalizar;
                // Helper para busca flexível
                const findKey = (t) => keys.find(k => k.trim() === t || norm(k) === t || norm(k).includes(t));

                const kNome = findKey('assistente') || findKey('nome');
                // Ignora linha de total ou vazia
                if (!kNome || (row[kNome] && row[kNome].toString().toLowerCase().includes('total'))) return;

                // Mapeamento de Colunas (Focado no seu Excel)
                // Procura a coluna exata "documentos_validados", se não achar, procura "total"
                const kTotal = keys.find(k => k.trim() === 'documentos_validados') || findKey('total');
                const kFifo = findKey('documentos_validados_fifo') || findKey('fifo');
                const kGT = findKey('gradual_total');
                const kGP = findKey('gradual_parcial');
                const kPFC = findKey('perfil_fc');

                // Identifica Usuário
                const nomeRaw = row[kNome] ? row[kNome].toString() : "";
                const uid = mapUsuarios[norm(nomeRaw)];

                if (uid) {
                    const pInt = (v) => {
                        if (typeof v === 'number') return v;
                        if (!v) return 0;
                        const s = v.toString().replace(/\./g, '').replace(',', '.');
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
                await Produtividade.supabase
                    .from('producao')
                    .upsert(updates, { onConflict: 'usuario_id, data_referencia' });
                totalImportados += updates.length;
            }

        } catch (err) {
            console.error(err);
            erros++;
        }
    }

    input.value = "";
    alert(`Importação finalizada!\nRegistros: ${totalImportados}\nArquivos com erro: ${erros}`);
    
    if (Produtividade.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) {
        Produtividade.Geral.carregarTela();
    }
};

document.addEventListener('DOMContentLoaded', Produtividade.init);