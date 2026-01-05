// js/produtividade_main.js

let _supabase = null;

async function inicializar() {
    // 1. Inicializa Conexão Supabase
    if (window.supabase) {
        _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        window._supabase = _supabase; // Torna global
        console.log("Supabase Conectado.");
    } else {
        console.error("Supabase SDK não encontrado.");
        return;
    }

    // 2. Inicializa Sistema de Dados
    await Sistema.Dados.inicializar();
    
    // 3. Inicializa as datas (Input Inteligente)
    Sistema.Datas.criarInputInteligente('global-date', 'produtividade_data_ref', () => {
        atualizarDataGlobal(document.getElementById('global-date').value);
    });

    // 4. Carrega a aba inicial (Padrão: Geral)
    mudarAba('geral');
}

// Função para atualizar a data em todos os módulos
function atualizarDataGlobal(novaData) {
    if (!novaData) return;
    
    // Atualiza Geral se estiver visível
    if (!document.getElementById('tab-geral').classList.contains('hidden')) {
        Geral.carregarTela();
    }
    
    // Atualiza Consolidado se estiver visível (ou força recarga no próximo clique)
    if (!document.getElementById('tab-consolidado').classList.contains('hidden')) {
        Cons.carregar();
    }
    
    // Atualiza Performance se estiver visível
    if (!document.getElementById('tab-performance').classList.contains('hidden')) {
        Perf.carregarRanking();
    }

    // A Matriz carrega o ano todo, então basta recarregar se o ano mudou (ou sempre)
    if (!document.getElementById('tab-matriz').classList.contains('hidden')) {
        Matriz.carregar();
    }
}

function atualizarBaseGlobal(novoValor) {
    // Mantido por compatibilidade, mas o input foi removido do HTML principal
    // Agora a base é controlada dentro do módulo Consolidado
}

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
        input.value = ""; // Limpa input
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

    // Mapeamento de Colunas (Flexível)
    // Tenta encontrar colunas com nomes variados
    const findKey = (row, possibilities) => {
        return Object.keys(row).find(k => possibilities.some(p => k.toLowerCase().includes(p)));
    };

    for (const row of dados) {
        // Tenta achar a coluna de nome (Analista, Nome, Funcionário)
        const keyNome = findKey(row, ['analista', 'nome', 'funcionário', 'funcionario']);
        // Tenta achar a quantidade (Quantidade, Total, Qtd)
        const keyQtd = findKey(row, ['quantidade', 'total', 'qtd']);
        
        if (keyNome && keyQtd) {
            const nomePlanilha = String(row[keyNome]).trim();
            const qtd = parseInt(row[keyQtd]) || 0;
            
            // Busca ID do usuário
            const uid = mapUsuarios[nomePlanilha.toLowerCase()];
            
            if (uid && qtd > 0) {
                // Prepara dados extras se existirem
                const fifo = parseInt(row['FIFO'] || row['fifo'] || 0);
                const gTotal = parseInt(row['Gradual Total'] || row['gradual total'] || 0);
                const gParcial = parseInt(row['Gradual Parcial'] || row['gradual parcial'] || 0);
                const perfilFc = parseInt(row['Perfil FC'] || row['perfil fc'] || 0);

                // Upsert no Banco
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

// --- CONTROLE DE ABAS ---
window.mudarAba = function(aba) {
    // 1. Esconde todas as abas
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    // 2. Remove classe ativa dos botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // 3. Mostra a aba selecionada
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    // 4. Ativa o botão correspondente
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    // 5. --- NOVO: GERENCIA OS CONTROLES CONTEXTUAIS NO TOPO ---
    // Esconde todos primeiro
    document.getElementById('ctrl-geral').classList.add('hidden');
    document.getElementById('ctrl-consolidado').classList.add('hidden');
    document.getElementById('ctrl-performance').classList.add('hidden');

    // Mostra o específico
    if (aba === 'geral') {
        document.getElementById('ctrl-geral').classList.remove('hidden');
        Geral.carregarTela();
    } 
    else if (aba === 'consolidado') {
        document.getElementById('ctrl-consolidado').classList.remove('hidden');
        Cons.init();
    } 
    else if (aba === 'performance') {
        document.getElementById('ctrl-performance').classList.remove('hidden');
        Perf.init();
    } 
    else if (aba === 'matriz') {
        // Matriz não tem controles extras por enquanto, apenas carrega
        Matriz.init();
    }
};

// Inicializa tudo ao carregar
document.addEventListener('DOMContentLoaded', inicializar);