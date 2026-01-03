const sessao = JSON.parse(localStorage.getItem('usuario'));
const KEY_DATA_GLOBAL = 'data_sistema_global';
const KEY_TAB_GLOBAL = 'produtividade_aba_ativa';

function mudarAba(aba) {
    localStorage.setItem(KEY_TAB_GLOBAL, aba);
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`tab-${aba}`);
    if(target) target.classList.remove('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`btn-${aba}`);
    if(btn) btn.classList.add('active');

    let dataString = localStorage.getItem(KEY_DATA_GLOBAL);
    if (!dataString) {
        dataString = new Date().toISOString().split('T')[0];
        localStorage.setItem(KEY_DATA_GLOBAL, dataString);
    }
    const [ano, mes, dia] = dataString.split('-').map(Number);

    // Inicialização Específica por Aba
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
        // Garante que o Perf use a data global
        if(typeof Perf !== 'undefined') Perf.syncData(dataString); 
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

            // Usa o cache centralizado do Sistema
            const usersMap = {};
            if (Sistema.Dados && Sistema.Dados.usuariosCache) {
                Object.values(Sistema.Dados.usuariosCache).forEach(u => usersMap[u.nome.trim().toLowerCase()] = u.id);
            }

            let inserts = [];
            for (let row of json) {
                const nomeCsv = row['assistente'];
                const idCsv = row['id_assistente'];
                if ((!idCsv && !nomeCsv) || String(nomeCsv).toLowerCase().includes('total')) continue;

                let uid = idCsv;
                if (!uid && nomeCsv && usersMap[nomeCsv.trim().toLowerCase()]) uid = usersMap[nomeCsv.trim().toLowerCase()];

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
                if(confirm(`Importar ${inserts.length} registros para ${matchData[1]}/${matchData[2]}/${matchData[3]}?`)) {
                    await _supabase.from('producao').upsert(inserts, { onConflict: 'usuario_id, data_referencia' });
                    alert("Sucesso!");
                    localStorage.setItem(KEY_DATA_GLOBAL, dataDoArquivo);
                    localStorage.setItem(KEY_TAB_GLOBAL, 'geral');
                    mudarAba('geral');
                }
            } else {
                alert("Nenhum usuário correspondente encontrado. Verifique se o sistema carregou os usuários.");
            }
        } catch (err) { alert("Erro: " + err.message); } finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', async () => {
    // CORREÇÃO CRÍTICA: Aguarda carregamento total do sistema antes de renderizar
    if(typeof Sistema !== 'undefined' && Sistema.Dados) {
        await Sistema.Dados.inicializar();
    }
    
    // Só restaura a aba após ter certeza que os dados estão prontos
    const lastTab = localStorage.getItem(KEY_TAB_GLOBAL) || 'geral';
    mudarAba(lastTab);
});