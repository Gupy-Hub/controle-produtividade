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
        
        // --- ALTERAÇÃO: Tentar pegar a data do NOME DO ARQUIVO primeiro ---
        let dataDetectada = null;
        const fileName = file.name.split('.')[0]; // Pega '05012026' de '05012026.xlsx'

        // Regex para validar apenas números com 8 dígitos (DDMMAAAA)
        if (/^\d{8}$/.test(fileName.trim())) {
            const dia = fileName.substring(0, 2);
            const mes = fileName.substring(2, 4);
            const ano = fileName.substring(4, 8);
            
            // Cria formato ISO (YYYY-MM-DD)
            dataDetectada = `${ano}-${mes}-${dia}`;
            console.log(`Data detectada pelo arquivo: ${dataDetectada}`);
        } else {
            // Fallback: Tenta pegar da primeira aba se o nome do arquivo não for uma data
            const firstSheetName = workbook.SheetNames[0]; 
            if (/^\d{8}$/.test(firstSheetName.trim())) {
                const dia = firstSheetName.substring(0, 2);
                const mes = firstSheetName.substring(2, 4);
                const ano = firstSheetName.substring(4, 8);
                dataDetectada = `${ano}-${mes}-${dia}`;
            }
        }

        // Pega os dados da primeira aba
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // defval: "" garante que células vazias venham como string vazia
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        await processarDadosImportados(jsonData, dataDetectada);
        input.value = "";
    };
    reader.readAsArrayBuffer(file);
}

async function processarDadosImportados(dados, dataRefImportacao) {
    let dataRef = "";

    // Lógica de Prioridade da Data
    if (dataRefImportacao) {
        dataRef = dataRefImportacao;
        const inputDate = document.getElementById('global-date');
        if (inputDate) {
            inputDate.value = dataRef;
            inputDate.classList.add('bg-yellow-100'); 
            setTimeout(() => inputDate.classList.remove('bg-yellow-100'), 1000);
        }
        alert(`Data identificada: ${dataRef.split('-').reverse().join('/')}.\nOs dados serão salvos nesta data.`);
    } else {
        // Se não achou data, usa a selecionada no painel
        dataRef = document.getElementById('global-date').value;
        if(!confirm(`Não foi possível detectar a data no nome do arquivo (ex: 05012026.xlsx). \nDeseja importar para a data selecionada no painel: ${dataRef.split('-').reverse().join('/')}?`)) {
            return;
        }
    }

    if (!dataRef) { 
        alert("Erro: Nenhuma data válida selecionada."); 
        return; 
    }
    
    let count = 0;
    // Carrega usuários para mapear Nome -> ID
    const { data: usersDB } = await _supabase.from('usuarios').select('id, nome');
    const mapUsuarios = {};
    if(usersDB) usersDB.forEach(u => mapUsuarios[u.nome.trim().toLowerCase()] = u.id);

    // Função auxiliar para achar chaves insensíveis a maiúsculas/minúsculas
    const findKey = (row, possibilities) => {
        return Object.keys(row).find(k => possibilities.some(p => k.toLowerCase() === p || k.toLowerCase().includes(p)));
    };

    for (const row of dados) {
        // --- ALTERAÇÃO: Mapeamento de colunas atualizado para o seu arquivo ---
        
        // Procura 'assistente' ou 'nome'
        const keyNome = findKey(row, ['assistente', 'analista', 'nome', 'funcionário', 'funcionario']);
        
        // Procura 'documentos_validados' (exato) ou 'total'
        // Usamos find específico para garantir que pegue a coluna de total e não as parciais
        let keyQtd = Object.keys(row).find(k => k.toLowerCase().trim() === 'documentos_validados');
        if (!keyQtd) keyQtd = findKey(row, ['quantidade', 'total', 'qtd']);
        
        if (keyNome && keyQtd) {
            const nomePlanilha = String(row[keyNome]).trim();
            // Pula linha de "Total" ou vazias
            if (nomePlanilha.toLowerCase() === 'total' || !nomePlanilha) continue;

            const qtd = parseInt(row[keyQtd]) || 0;
            const uid = mapUsuarios[nomePlanilha.toLowerCase()];
            
            if (uid) {
                // --- Mapeamento das colunas específicas do seu Excel ---
                const fifo = parseInt(row['documentos_validados_fifo'] || row['FIFO'] || row['fifo'] || 0);
                const gTotal = parseInt(row['documentos_validados_gradual_total'] || row['Gradual Total'] || row['gradual total'] || 0);
                const gParcial = parseInt(row['documentos_validados_gradual_parcial'] || row['Gradual Parcial'] || row['gradual parcial'] || 0);
                const perfilFc = parseInt(row['documentos_validados_perfil_fc'] || row['Perfil FC'] || row['perfil fc'] || 0);

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
                else console.error("Erro ao salvar:", error);
            } else {
                console.warn(`Usuário não encontrado no banco: ${nomePlanilha}`);
            }
        }
    }
    
    const dataFmt = dataRef.split('-').reverse().join('/');
    alert(`${count} registros importados com sucesso para o dia ${dataFmt}!`);
    atualizarDataGlobal(dataRef);
}

// --- FUNÇÃO PARA MUDAR O CONTEXTO DOS SELETORES ---
window.mudarAba = function(aba) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

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