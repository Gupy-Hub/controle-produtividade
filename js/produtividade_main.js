let _supabase = null;

async function inicializar() {
    if (window.supabase) {
        _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        window._supabase = _supabase;
        console.log("Supabase Conectado.");
    } else {
        console.error("Supabase SDK não encontrado.");
        return;
    }

    await Sistema.Dados.inicializar();
    
    Sistema.Datas.criarInputInteligente('global-date', 'produtividade_data_ref', () => {
        atualizarDataGlobal(document.getElementById('global-date').value);
    });

    mudarAba('geral');
}

function atualizarDataGlobal(novaData) {
    if (!novaData) return;
    if (!document.getElementById('tab-geral').classList.contains('hidden')) { Geral.carregarTela(); }
    if (!document.getElementById('tab-consolidado').classList.contains('hidden')) { Cons.carregar(); }
    if (!document.getElementById('tab-performance').classList.contains('hidden')) { Perf.carregarRanking(); }
    if (!document.getElementById('tab-matriz').classList.contains('hidden')) { Matriz.carregar(); }
}

function atualizarBaseGlobal(novoValor) {} // Deprecado

function importarExcel(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        await processarDadosImportados(jsonData);
        input.value = "";
    };
    reader.readAsArrayBuffer(file);
}

async function processarDadosImportados(dados) {
    const dataRef = document.getElementById('global-date').value;
    if (!dataRef) { alert("Selecione uma data antes."); return; }
    
    let count = 0;
    const { data: usersDB } = await _supabase.from('usuarios').select('id, nome');
    const mapUsuarios = {};
    if(usersDB) usersDB.forEach(u => mapUsuarios[u.nome.trim().toLowerCase()] = u.id);

    const findKey = (row, possibilities) => {
        return Object.keys(row).find(k => possibilities.some(p => k.toLowerCase().includes(p)));
    };

    for (const row of dados) {
        const keyNome = findKey(row, ['analista', 'nome', 'funcionário', 'funcionario']);
        const keyQtd = findKey(row, ['quantidade', 'total', 'qtd']);
        
        if (keyNome && keyQtd) {
            const nomePlanilha = String(row[keyNome]).trim();
            const qtd = parseInt(row[keyQtd]) || 0;
            const uid = mapUsuarios[nomePlanilha.toLowerCase()];
            
            if (uid && qtd > 0) {
                const fifo = parseInt(row['FIFO'] || row['fifo'] || 0);
                const gTotal = parseInt(row['Gradual Total'] || row['gradual total'] || 0);
                const gParcial = parseInt(row['Gradual Parcial'] || row['gradual parcial'] || 0);
                const perfilFc = parseInt(row['Perfil FC'] || row['perfil fc'] || 0);

                const { error } = await _supabase
                    .from('producao')
                    .upsert({ 
                        usuario_id: uid, 
                        data_referencia: dataRef, 
                        quantidade: qtd,
                        fifo: fifo,
                        gradual_total: gTotal,
                        gradual_parcial: gParcial,
                        perfil_fc: perfilFc,
                        updated_at: new Date()
                    }, { onConflict: 'usuario_id, data_referencia' });
                
                if (!error) count++;
            }
        }
    }
    alert(`${count} registros importados/atualizados para ${dataRef}!`);
    atualizarDataGlobal(dataRef);
}

// --- FUNÇÃO CRÍTICA PARA OS SELETORES DO TOPO ---
window.mudarAba = function(aba) {
    // 1. Esconde Abas
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    // 2. Reseta Botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // 3. Mostra Aba Atual
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    // 4. Ativa Botão Atual
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    // 5. GERENCIA SELETORES DO TOPO (CORREÇÃO)
    // Esconde todos
    const ctrls = ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'];
    ctrls.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    // Mostra o específico
    if (aba === 'geral') {
        const c = document.getElementById('ctrl-geral');
        if(c) c.classList.remove('hidden');
        Geral.carregarTela();
    } 
    else if (aba === 'consolidado') {
        const c = document.getElementById('ctrl-consolidado');
        if(c) c.classList.remove('hidden');
        Cons.init();
    } 
    else if (aba === 'performance') {
        const c = document.getElementById('ctrl-performance');
        if(c) c.classList.remove('hidden');
        Perf.init();
    } 
    else if (aba === 'matriz') {
        Matriz.init();
    }
};

document.addEventListener('DOMContentLoaded', inicializar);