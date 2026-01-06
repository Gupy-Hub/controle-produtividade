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
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // --- DETECÇÃO DA DATA NO NOME DO ARQUIVO ---
            let dataDetectada = null;
            const fileName = file.name.split('.')[0]; // Pega '05012026' de '05012026.xlsx'

            // Regex para validar apenas números com 8 dígitos (DDMMAAAA)
            if (/^\d{8}$/.test(fileName.trim())) {
                const dia = fileName.substring(0, 2);
                const mes = fileName.substring(2, 4);
                const ano = fileName.substring(4, 8);
                dataDetectada = `${ano}-${mes}-${dia}`;
                console.log(`Data detectada pelo arquivo: ${dataDetectada}`);
            } else {
                // Fallback: Tenta pegar da primeira aba
                const firstSheetName = workbook.SheetNames[0]; 
                if (/^\d{8}$/.test(firstSheetName.trim())) {
                    const dia = firstSheetName.substring(0, 2);
                    const mes = firstSheetName.substring(2, 4);
                    const ano = firstSheetName.substring(4, 8);
                    dataDetectada = `${ano}-${mes}-${dia}`;
                }
            }

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            await processarDadosImportados(jsonData, dataDetectada);
        } catch (err) {
            console.error("Erro crítico ao ler Excel:", err);
            alert("Erro ao ler o arquivo. Verifique se é um Excel válido.");
        }
        input.value = "";
    };
    reader.readAsArrayBuffer(file);
}

async function processarDadosImportados(dados, dataRefImportacao) {
    let dataRef = "";

    if (dataRefImportacao) {
        dataRef = dataRefImportacao;
        const inputDate = document.getElementById('global-date');
        if (inputDate) {
            inputDate.value = dataRef;
            inputDate.classList.add('bg-yellow-100'); 
            setTimeout(() => inputDate.classList.remove('bg-yellow-100'), 1000);
        }
    } else {
        dataRef = document.getElementById('global-date').value;
        if(!confirm(`Não foi possível detectar a data no nome do arquivo.\nDeseja importar para a data selecionada: ${dataRef.split('-').reverse().join('/')}?`)) {
            return;
        }
    }

    if (!dataRef) { 
        alert("Erro: Nenhuma data válida."); 
        return; 
    }
    
    let count = 0;
    // Carrega usuários para mapear Nome -> ID
    const { data: usersDB } = await _supabase.from('usuarios').select('id, nome');
    const mapUsuarios = {};
    if(usersDB) usersDB.forEach(u => mapUsuarios[u.nome.trim().toLowerCase()] = u.id);

    // --- FUNÇÃO DE BUSCA DE COLUNA MELHORADA ---
    const findKey = (row, possibilities) => {
        const keys = Object.keys(row);
        
        // 1. Prioridade: Match EXATO (Ignora maiúsculas/minúsculas)
        // Isso garante que 'assistente' seja escolhido antes de 'id_assistente'
        const exact = keys.find(k => possibilities.some(p => k.trim().toLowerCase() === p.toLowerCase()));
        if (exact) return exact;

        // 2. Fallback: Match PARCIAL (Contém)
        return keys.find(k => possibilities.some(p => {
            const keyLower = k.trim().toLowerCase();
            // IMPORTANTE: Ignora colunas que começam com 'id_' ou 'cod' para não pegar IDs numéricos
            if (keyLower.startsWith('id_') || keyLower.startsWith('id ') || keyLower.startsWith('cod')) return false;
            return keyLower.includes(p.toLowerCase());
        }));
    };

    for (const row of dados) {
        // Busca coluna de nome (prioriza 'assistente' exato)
        const keyNome = findKey(row, ['assistente', 'analista', 'nome', 'funcionário']);
        
        // Busca coluna de quantidade total
        let keyQtd = Object.keys(row).find(k => k.trim().toLowerCase() === 'documentos_validados'); // Prioridade máxima
        if (!keyQtd) keyQtd = findKey(row, ['quantidade', 'total', 'qtd']);
        
        if (keyNome && keyQtd) {
            const nomePlanilha = String(row[keyNome]).trim();
            
            // Ignora linhas de totalização ou vazias
            if (!nomePlanilha || nomePlanilha.toLowerCase() === 'total' || nomePlanilha.toLowerCase().includes('total geral')) continue;

            const qtd = parseInt(row[keyQtd]) || 0;
            const uid = mapUsuarios[nomePlanilha.toLowerCase()];
            
            if (uid) {
                // Mapeamento das colunas específicas
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
                else console.error(`Erro ao salvar ${nomePlanilha}:`, error);
            } else {
                console.warn(`Usuário não encontrado no banco: ${nomePlanilha} (Verifique se o nome na planilha é igual ao do sistema)`);
            }
        }
    }
    
    const dataFmt = dataRef.split('-').reverse().join('/');
    if (count > 0) {
        alert(`${count} registros importados com sucesso para o dia ${dataFmt}!`);
        atualizarDataGlobal(dataRef);
    } else {
        alert(`Nenhum dado importado. Verifique se os nomes na coluna 'Assistente' batem com o cadastro.`);
    }
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