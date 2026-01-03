// js/produtividade_main.js

const sessao = JSON.parse(localStorage.getItem('usuario'));
const KEY_DATA_GLOBAL = 'data_sistema_global';
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
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${aba}`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${aba}`).classList.add('active');

    // Recupera data global (ex: "2023-10-25")
    const dataString = localStorage.getItem(KEY_DATA_GLOBAL) || Sistema.Datas.formatar(new Date());
    
    // Converte para objeto Date para extrair partes
    const [ano, mes, dia] = dataString.split('-').map(Number); // Assume formato YYYY-MM-DD do input type="date"
    const dataObj = new Date(ano, mes - 1, dia);

    if (aba === 'geral') { 
        const inp = document.getElementById('data-validacao');
        if(inp) inp.value = dataString; 
        if(typeof Geral !== 'undefined') Geral.carregarTela(); 
    }
    
    if (aba === 'performance') { 
        // Lógica de Sincronização de Data
        const inpMonth = document.getElementById('perf-input-month');
        const inpYear = document.getElementById('perf-input-year');
        
        // Formata YYYY-MM para o input type="month"
        const anoStr = dataObj.getFullYear().toString();
        const mesStr = String(dataObj.getMonth() + 1).padStart(2, '0');
        
        if(inpMonth) inpMonth.value = `${anoStr}-${mesStr}`;
        if(inpYear) inpYear.value = anoStr;

        if(typeof Perf !== 'undefined') {
            Perf.uiChange(); // Ajusta visibilidade dos inputs
            Perf.carregarRanking(); 
        }
    }
    
    if (aba === 'matriz') { 
        const inp = document.getElementById('data-matriz');
        if(inp) inp.value = dataString; 
        if(typeof Matriz !== 'undefined') Matriz.init(); 
    }
    
    if (aba === 'consolidado') { 
        const inp = document.getElementById('data-cons');
        if(inp) inp.value = dataString; 
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
                    mudarAba('geral');
                }
            } else alert("Dados inválidos.");
        } catch (err) { alert("Erro: " + err.message); } finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(file);
}

// --- Inicialização Global ---
document.addEventListener('DOMContentLoaded', async () => {
    await carregarUsuariosGlobal();
    if(typeof Sistema !== 'undefined' && Sistema.Datas) {
        Sistema.Datas.criarInputInteligente('data-validacao', KEY_DATA_GLOBAL, () => {
            if(typeof Geral !== 'undefined') Geral.carregarTela();
        });
    }
    await Sistema.Dados.inicializar(); 
    
    // Inicia na aba Geral
    if(typeof Geral !== 'undefined') Geral.carregarTela();
});