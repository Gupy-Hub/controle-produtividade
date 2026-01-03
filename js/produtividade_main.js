// js/produtividade_main.js

const sessao = JSON.parse(localStorage.getItem('usuario'));
const KEY_DATA_GLOBAL = 'data_sistema_global';
const KEY_TAB_GLOBAL = 'produtividade_aba_ativa'; // Chave para salvar a aba
let USERS_CACHE = {};

// --- Carregamento Global de Usuários (Cache) ---
async function carregarUsuariosGlobal() {
    try {
        const { data, error } = await _supabase.from('usuarios').select('id, nome, funcao, contrato');
        if (data) {
            data.forEach(u => {
                USERS_CACHE[u.id] = u;
            });
        }
    } catch (e) { console.error("Erro cache user", e); }
}

// --- Controle de Abas ---
function mudarAba(aba) {
    // 1. Salva a aba atual no LocalStorage
    localStorage.setItem(KEY_TAB_GLOBAL, aba);

    // 2. Esconde todas as seções
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    
    // 3. Mostra a seção selecionada
    const targetTab = document.getElementById(`tab-${aba}`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
    }
    
    // 4. Atualiza estado visual dos botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`btn-${aba}`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // 5. Recupera data global para inicializar os inputs da aba
    const dataAtual = localStorage.getItem(KEY_DATA_GLOBAL) || Sistema.Datas.formatar(new Date());

    // 6. Roteamento de Inicialização (Carrega os dados da aba específica)
    if (aba === 'geral') { 
        const inp = document.getElementById('data-validacao');
        if(inp) inp.value = dataAtual; 
        if(typeof Geral !== 'undefined') Geral.carregarTela(); 
    }
    if (aba === 'performance') { 
        const inp = document.getElementById('data-perf');
        if(inp) inp.value = dataAtual; 
        if(typeof Perf !== 'undefined') Perf.init(); 
    }
    if (aba === 'matriz') { 
        const inp = document.getElementById('data-matriz');
        if(inp) inp.value = dataAtual; 
        if(typeof Matriz !== 'undefined') Matriz.init(); 
    }
    if (aba === 'consolidado') { 
        const inp = document.getElementById('data-cons');
        if(inp) inp.value = dataAtual; 
        if(typeof Cons !== 'undefined') Cons.init(); 
    }
}

// --- Função de Importação Excel (Compartilhada) ---
async function importarExcel(input) {
    const file = input.files[0];
    if (!file) return;
    const nomeArquivo = file.name;
    const matchData = nomeArquivo.match(/^(\d{2})(\d{2})(\d{4})/);
    if (!matchData) { alert("Nome inválido (ddmmaaaa.xlsx)"); input.value = ''; return; }
    const dataDoArquivo = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            if (json.length === 0) return alert("Vazia.");

            const usersMap = {};
            // Pequena query local para garantir mapeamento correto no momento do import
            const { data: users } = await _supabase.from('usuarios').select('id, nome');
            if(users) users.forEach(u => usersMap[u.nome.trim().toLowerCase()] = u.id);

            let inserts = [];
            for (let row of json) {
                const nomeCsv = row['assistente'];
                const idCsv = row['id_assistente'];
                if (!idCsv && !nomeCsv) continue;
                if (String(nomeCsv).toLowerCase().includes('total')) continue;

                let uid = idCsv;
                if (!uid && nomeCsv && usersMap[nomeCsv.trim().toLowerCase()]) uid = usersMap[nomeCsv.trim().toLowerCase()];

                if (uid) {
                    inserts.push({
                        usuario_id: uid, data_referencia: dataDoArquivo,
                        quantidade: row['documentos_validados'] || 0,
                        fifo: row['documentos_validados_fifo'] || 0,
                        gradual_total: row['documentos_validados_gradual_total'] || 0,
                        gradual_parcial: row['documentos_validados_gradual_parcial'] || 0,
                        perfil_fc: row['documentos_validados_perfil_fc'] || 0
                    });
                }
            }

            if (inserts.length > 0) {
                if(confirm(`Importar ${inserts.length} registros para ${matchData[1]}/${matchData[2]}/${matchData[3]}?`)) {
                    const { error } = await _supabase.from('producao').upsert(inserts, { onConflict: 'usuario_id, data_referencia' });
                    if (error) throw error;
                    alert("Sucesso!");
                    localStorage.setItem(KEY_DATA_GLOBAL, `${matchData[1]}/${matchData[2]}/${matchData[3]}`);
                    
                    // Força recarregamento da aba atual
                    const currentTab = localStorage.getItem(KEY_TAB_GLOBAL) || 'geral';
                    mudarAba(currentTab);
                }
            } else alert("Dados inválidos ou vazios.");
        } catch (err) { alert("Erro: " + err.message); } finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(file);
}

// --- Inicialização Global ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Carrega dados básicos
    await carregarUsuariosGlobal();
    
    // 2. Configura listener para input de data global (se o sistema suportar)
    if(typeof Sistema !== 'undefined' && Sistema.Datas) {
        Sistema.Datas.criarInputInteligente('data-validacao', KEY_DATA_GLOBAL, () => {
            // Só recarrega se estiver na aba geral
            const activeTab = localStorage.getItem(KEY_TAB_GLOBAL);
            if(activeTab === 'geral' && typeof Geral !== 'undefined') {
                 Geral.carregarTela();
            }
        });
    }
    
    // 3. Inicializa sistema base
    await Sistema.Dados.inicializar(); 
    
    // 4. RESTAURA A ÚLTIMA ABA ABERTA (ou vai para 'geral' se for a primeira vez)
    const lastTab = localStorage.getItem(KEY_TAB_GLOBAL) || 'geral';
    mudarAba(lastTab);
});