let _supabase = null;

const MA_Main = {
    // Objeto auxiliar se necessário no futuro, mantendo padrão
};

async function inicializar() {
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
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

    // Garante data inicial se vazio
    const dateInput = document.getElementById('global-date');
    if (!dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    mudarAba('geral');
}

function atualizarDataGlobal(novaData) {
    if (!novaData) return;
    // Salva no localStorage para persistência
    localStorage.setItem('produtividade_data_ref', novaData);

    if (!document.getElementById('tab-geral').classList.contains('hidden')) { Geral.carregarTela(); }
    if (!document.getElementById('tab-consolidado').classList.contains('hidden')) { Cons.carregar(); }
    if (!document.getElementById('tab-performance').classList.contains('hidden')) { Perf.carregarRanking(); }
    if (!document.getElementById('tab-matriz').classList.contains('hidden')) { Matriz.carregar(); }
}

function importarExcel(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 1. Pega o nome da primeira aba
        const firstSheetName = workbook.SheetNames[0]; // Ex: "01012026"
        
        // 2. Tenta extrair a data do nome da aba
        let dataDetectada = null;
        
        // Regex para validar apenas números com 8 dígitos (DDMMAAAA)
        if (/^\d{8}$/.test(firstSheetName.trim())) {
            const dia = firstSheetName.substring(0, 2);
            const mes = firstSheetName.substring(2, 4);
            const ano = firstSheetName.substring(4, 8);
            
            // Cria formato ISO (YYYY-MM-DD) para o input type="date" e banco
            dataDetectada = `${ano}-${mes}-${dia}`;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        await processarDadosImportados(jsonData, dataDetectada);
        input.value = "";
    };
    reader.readAsArrayBuffer(file);
}

async function processarDadosImportados(dados, dataDaAba) {
    let dataRef = "";

    // Lógica de Prioridade da Data
    if (dataDaAba) {
        // Se achou data no nome da aba, USA ELA e atualiza o painel
        dataRef = dataDaAba;
        const inputDate = document.getElementById('global-date');
        if (inputDate) {
            inputDate.value = dataRef;
            // Atualiza visualmente para o usuário saber que mudou
            inputDate.classList.add('bg-yellow-100'); 
            setTimeout(() => inputDate.classList.remove('bg-yellow-100'), 1000);
        }
        alert(`Data identificada na aba: ${dataRef.split('-').reverse().join('/')}.\nOs dados serão salvos nesta data.`);
    } else {
        // Se não, usa a data que já estava selecionada no input
        dataRef = document.getElementById('global-date').value;
    }

    if (!dataRef) { 
        alert("Erro: Nenhuma data selecionada e o nome da aba não contém uma data válida (DDMMAAAA)."); 
        return; 
    }
    
    let count = 0;
    // Carrega usuários para mapear Nome -> ID
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
    
    const dataFmt = dataRef.split('-').reverse().join('/');
    alert(`${count} registros importados com sucesso para o dia ${dataFmt}!`);
    atualizarDataGlobal(dataRef);
}

// --- FUNÇÃO PARA MUDAR O CONTEXTO DOS SELETORES ---
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

    // 5. GERENCIA SELETORES DO TOPO
    const ctrls = ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'];
    ctrls.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    // Mostra o específico e carrega dados
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