const sessao = JSON.parse(localStorage.getItem('usuario'));
const KEY_DATA_GLOBAL = 'data_sistema_global';
const KEY_TAB_GLOBAL = 'produtividade_aba_ativa';
let USERS_CACHE = {};

// Cache de Usuários - Otimizado e Centralizado
async function carregarUsuariosGlobal() {
    // Se já carregou e tem dados, retorna o cache existente
    if (Object.keys(USERS_CACHE).length > 0) return USERS_CACHE;

    try {
        // Busca apenas usuários ativos e colunas essenciais
        const { data, error } = await _supabase
            .from('usuarios')
            .select('id, nome, funcao, contrato')
            .eq('ativo', true);
        
        if (error) throw error;
        
        if (data) {
            USERS_CACHE = {}; // Limpa antes de preencher
            data.forEach(u => USERS_CACHE[u.id] = u);
        }
        return USERS_CACHE;
    } catch (e) { 
        console.error("Erro crítico ao carregar usuários:", e);
        return {}; // Retorna vazio para não quebrar a Promise
    }
}

function mudarAba(aba) {
    localStorage.setItem(KEY_TAB_GLOBAL, aba);
    
    // Controle de visibilidade das abas
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`tab-${aba}`);
    if(target) target.classList.remove('hidden');
    
    // Controle dos botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`btn-${aba}`);
    if(btn) btn.classList.add('active');

    // Recupera e garante data válida
    let dataString = localStorage.getItem(KEY_DATA_GLOBAL);
    if (!dataString) {
        dataString = new Date().toISOString().split('T')[0];
        localStorage.setItem(KEY_DATA_GLOBAL, dataString);
    }
    const [ano, mes, dia] = dataString.split('-').map(Number);

    // Inicialização Específica por Aba (Lazy Load Inteligente)
    if (aba === 'geral') { 
        const inp = document.getElementById('data-validacao');
        if(inp && !inp.value) { 
             const dStr = String(dia).padStart(2,'0');
             const mStr = String(mes).padStart(2,'0');
             inp.value = `${dStr}/${mStr}/${ano}`;
        }
        if(typeof Geral !== 'undefined') Geral.carregarTela(); 
    }
    
    if (aba === 'performance') { 
        if(typeof Perf !== 'undefined') {
            // Garante que o Perf tenha acesso ao cache atualizado
            Perf.syncData(dataString); 
        }
    }
    
    if (aba === 'matriz') { 
        const inp = document.getElementById('data-matriz');
        if(inp && !inp.value) {
             const dStr = String(dia).padStart(2,'0');
             const mStr = String(mes).padStart(2,'0');
             inp.value = `${dStr}/${mStr}/${ano}`;
        }
        if(typeof Matriz !== 'undefined') Matriz.init(); 
    }
    
    if (aba === 'consolidado') { 
        const inp = document.getElementById('data-cons');
        if(inp && !inp.value) {
             const dStr = String(dia).padStart(2,'0');
             const mStr = String(mes).padStart(2,'0');
             inp.value = `${dStr}/${mStr}/${ano}`;
        }
        if(typeof Cons !== 'undefined') Cons.init(); 
    }
}

async function importarExcel(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Validação do nome do arquivo
    const nomeArquivo = file.name;
    const matchData = nomeArquivo.match(/^(\d{2})(\d{2})(\d{4})/);
    if (!matchData) { 
        alert("Nome do arquivo inválido. Formato exigido: ddmmaaaa.xlsx (Ex: 05012024.xlsx)"); 
        input.value = ''; 
        return; 
    }
    const dataDoArquivo = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            if (json.length === 0) return alert("O arquivo Excel está vazio.");

            // Garante que temos os IDs dos usuários antes de processar
            await carregarUsuariosGlobal();
            
            // Cria mapa de Nomes -> IDs (Normalizado)
            const usersMap = {};
            Object.values(USERS_CACHE).forEach(u => usersMap[u.nome.trim().toLowerCase()] = u.id);

            let inserts = [];
            for (let row of json) {
                const nomeCsv = row['assistente'];
                const idCsv = row['id_assistente'];
                
                // Ignora linhas de totais ou vazias
                if ((!idCsv && !nomeCsv) || String(nomeCsv).toLowerCase().includes('total')) continue;

                let uid = idCsv;
                // Tenta encontrar pelo nome se não tiver ID no Excel
                if (!uid && nomeCsv && usersMap[nomeCsv.trim().toLowerCase()]) {
                    uid = usersMap[nomeCsv.trim().toLowerCase()];
                }

                if (uid) {
                    inserts.push({
                        usuario_id: uid, 
                        data_referencia: dataDoArquivo,
                        quantidade: row['documentos_validados'] || 0,
                        fifo: row['documentos_validados_fifo'] || 0,
                        gradual_total: row['documentos_validados_gradual_total'] || 0,
                        gradual_parcial: row['documentos_validados_gradual_parcial'] || 0,
                        perfil_fc: row['documentos_validados_perfil_fc'] || 0
                    });
                }
            }

            if (inserts.length > 0) {
                if(confirm(`Confirmar importação de ${inserts.length} registros para a data ${matchData[1]}/${matchData[2]}/${matchData[3]}?`)) {
                    const { error } = await _supabase.from('producao').upsert(inserts, { onConflict: 'usuario_id, data_referencia' });
                    if(error) throw error;
                    
                    alert("Importação realizada com sucesso!");
                    localStorage.setItem(KEY_DATA_GLOBAL, dataDoArquivo);
                    localStorage.setItem(KEY_TAB_GLOBAL, 'geral');
                    mudarAba('geral');
                }
            } else {
                alert("Nenhum usuário válido encontrado no arquivo. Verifique os nomes ou IDs.");
            }
        } catch (err) { 
            console.error(err);
            alert("Erro na importação: " + err.message); 
        } finally { 
            input.value = ''; 
        }
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', async () => {
    // CORREÇÃO: Aguarda TODAS as cargas iniciais antes de renderizar a tela
    // Isso evita que a aba Performance carregue vazia por falta de usuários
    try {
        const promises = [carregarUsuariosGlobal()];
        
        if(typeof Sistema !== 'undefined' && Sistema.Dados) {
            promises.push(Sistema.Dados.inicializar());
        }

        await Promise.all(promises);
    } catch (e) {
        console.error("Erro na inicialização dos dados:", e);
    }
    
    // Só muda a aba depois que os dados (Users e Sistema) estiverem na memória
    const lastTab = localStorage.getItem(KEY_TAB_GLOBAL) || 'geral';
    mudarAba(lastTab);
});