// js/produtividade_main.js

const sessao = JSON.parse(localStorage.getItem('usuario'));
const KEY_DATA_GLOBAL = 'data_sistema_global';
const KEY_TAB_GLOBAL = 'produtividade_aba_ativa';
let USERS_CACHE = {};

// --- Carregamento Global de Usuários (Cache) ---
// Otimização: Baixa apenas colunas essenciais
async function carregarUsuariosGlobal() {
    if (Object.keys(USERS_CACHE).length > 0) return; // Evita recarregar se já existe

    try {
        const { data, error } = await _supabase
            .from('usuarios')
            .select('id, nome, funcao, contrato'); // Select específico
        
        if (error) throw error;
        
        if (data) {
            data.forEach(u => {
                USERS_CACHE[u.id] = u;
            });
        }
    } catch (e) { console.error("Erro cache user", e); }
}

// --- Controle de Abas ---
function mudarAba(aba) {
    localStorage.setItem(KEY_TAB_GLOBAL, aba);
    
    // UI das Abas
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const targetTab = document.getElementById(`tab-${aba}`);
    if (targetTab) targetTab.classList.remove('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`btn-${aba}`);
    if (targetBtn) targetBtn.classList.add('active');

    // Recupera data global salva (YYYY-MM-DD)
    let dataString = localStorage.getItem(KEY_DATA_GLOBAL);
    
    // Se não tiver data salva, usa hoje e salva
    if (!dataString) {
        const hoje = new Date();
        const y = hoje.getFullYear();
        const m = String(hoje.getMonth() + 1).padStart(2, '0');
        const d = String(hoje.getDate()).padStart(2, '0');
        dataString = `${y}-${m}-${d}`;
        localStorage.setItem(KEY_DATA_GLOBAL, dataString);
    }

    const [ano, mes, dia] = dataString.split('-').map(Number);

    // --- LÓGICA ESPECÍFICA DE CADA ABA ---

    if (aba === 'geral') { 
        const inp = document.getElementById('data-validacao');
        if(inp) {
            const diaStr = String(dia).padStart(2, '0');
            const mesStr = String(mes).padStart(2, '0');
            inp.value = `${diaStr}/${mesStr}/${ano}`; 
        }
        if(typeof Geral !== 'undefined') Geral.carregarTela(); 
    }
    
    if (aba === 'performance') { 
        const inpMonth = document.getElementById('perf-input-month');
        const inpYear = document.getElementById('perf-input-year');
        const inpQuarter = document.getElementById('perf-input-quarter');
        const inpSemester = document.getElementById('perf-input-semester');
        
        const anoStr = ano.toString();
        const mesStr = String(mes).padStart(2, '0');
        const quarterVal = Math.ceil(mes / 3).toString();
        const semesterVal = Math.ceil(mes / 6).toString();
        
        if(inpMonth) inpMonth.value = `${anoStr}-${mesStr}`;
        if(inpYear) inpYear.value = anoStr;
        if(inpQuarter) inpQuarter.value = quarterVal;
        if(inpSemester) inpSemester.value = semesterVal;

        if(typeof Perf !== 'undefined') {
            Perf.uiChange(); 
        }
    }
    
    if (aba === 'matriz') { 
        const inp = document.getElementById('data-matriz');
        if(inp) {
            const diaStr = String(dia).padStart(2, '0');
            const mesStr = String(mes).padStart(2, '0');
            inp.value = `${diaStr}/${mesStr}/${ano}`;
        }
        if(typeof Matriz !== 'undefined') Matriz.init(); 
    }
    
    if (aba === 'consolidado') { 
        const inp = document.getElementById('data-cons');
        if(inp) {
            const diaStr = String(dia).padStart(2, '0');
            const mesStr = String(mes).padStart(2, '0');
            inp.value = `${diaStr}/${mesStr}/${ano}`;
        }
        if(typeof Cons !== 'undefined') Cons.init(); 
    }
}

// --- Função de Importação Excel ---
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

            // Garante cache de usuários antes de importar
            await carregarUsuariosGlobal();
            
            // Mapa local de nome -> id para agilizar
            const usersMap = {};
            Object.values(USERS_CACHE).forEach(u => usersMap[u.nome.trim().toLowerCase()] = u.id);

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
                    
                    localStorage.setItem(KEY_DATA_GLOBAL, dataDoArquivo);
                    localStorage.setItem(KEY_TAB_GLOBAL, 'geral');
                    mudarAba('geral');
                }
            } else alert("Dados inválidos ou vazios.");
        } catch (err) { alert("Erro: " + err.message); } finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', async () => {
    await carregarUsuariosGlobal();
    
    if(typeof Sistema !== 'undefined' && Sistema.Datas && Sistema.Datas.criarInputInteligente) {
        Sistema.Datas.criarInputInteligente('data-validacao', KEY_DATA_GLOBAL, () => {
            const activeTab = localStorage.getItem(KEY_TAB_GLOBAL);
            if(activeTab === 'geral' && typeof Geral !== 'undefined') {
                 Geral.carregarTela();
            }
        });
    }
    
    if(typeof Sistema !== 'undefined') await Sistema.Dados.inicializar(); 
    
    const lastTab = localStorage.getItem(KEY_TAB_GLOBAL) || 'geral';
    mudarAba(lastTab);
});