// js/produtividade_main.js

let _supabase = null;

async function inicializar() {
    // 1. Verifica credenciais globais (Do config.js)
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = _supabase; // Torna global para os outros arquivos
        console.log("Supabase Conectado.");
    } else {
        console.error("ERRO CRÍTICO: Supabase SDK ou Credenciais não encontrados. Verifique js/config.js");
        alert("Erro de configuração: Credenciais do banco de dados não encontradas.");
        return;
    }

    // 2. Inicializa o Sistema de Dados
    // Aguarda o sistema carregar os caches antes de prosseguir
    await Sistema.Dados.inicializar();
    
    // 3. Inicializa o Input de Data com valor padrão HOJE se estiver vazio
    Sistema.Datas.criarInputInteligente('global-date', 'produtividade_data_ref', () => {
        const val = document.getElementById('global-date').value;
        if(val) atualizarDataGlobal(val);
    });

    // Garante que existe uma data setada antes de carregar a primeira aba
    const dateInput = document.getElementById('global-date');
    if (!dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // 4. Carrega a aba inicial
    mudarAba('geral');
}

function atualizarDataGlobal(novaData) {
    if (!novaData) return;
    
    // Só recarrega a aba que está visível para economizar recursos
    if (!document.getElementById('tab-geral').classList.contains('hidden')) { Geral.carregarTela(); }
    if (!document.getElementById('tab-consolidado').classList.contains('hidden')) { Cons.carregar(); }
    if (!document.getElementById('tab-performance').classList.contains('hidden')) { Perf.carregarRanking(); }
    if (!document.getElementById('tab-matriz').classList.contains('hidden')) { Matriz.carregar(); }
}

function atualizarBaseGlobal(novoValor) {} 

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

window.mudarAba = function(aba) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    // Gerencia Seletores do Topo
    const ctrls = ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'];
    ctrls.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

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