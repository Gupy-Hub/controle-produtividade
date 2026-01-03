const sessao = JSON.parse(localStorage.getItem('usuario'));
const KEY_DATA_GLOBAL = 'data_sistema_global';
const KEY_TAB_GLOBAL = 'produtividade_aba_ativa';

function atualizarDataGlobal(novaData) {
    if(!novaData) return;
    localStorage.setItem(KEY_DATA_GLOBAL, novaData);
    
    sincronizarInputBaseHC(novaData);

    const abaAtual = localStorage.getItem(KEY_TAB_GLOBAL) || 'geral';
    mudarAba(abaAtual);
}

// --- LÓGICA DE BASE MANUAL (SIMPLIFICADA) ---
function atualizarBaseGlobal(novoValor) {
    const globalInput = document.getElementById('global-date');
    const dataRef = globalInput ? globalInput.value : new Date().toISOString().split('T')[0];
    
    if (typeof Sistema !== 'undefined' && Sistema.Dados) {
        // Define diretamente sem confirmação (Manual é soberano para o mês)
        Sistema.Dados.definirBaseHC(dataRef, novoValor);
        
        // Feedback visual leve
        const inputBase = document.getElementById('global-base-hc');
        if(inputBase) {
            inputBase.style.color = '#2563eb'; // Azul para indicar alteração manual salva
            setTimeout(() => inputBase.style.color = '#334155', 1000);
        }

        // Recarrega a aba atual
        const abaAtual = localStorage.getItem(KEY_TAB_GLOBAL);
        if (abaAtual === 'geral' && typeof Geral !== 'undefined') Geral.carregarTela();
        if (abaAtual === 'consolidado' && typeof Cons !== 'undefined') Cons.carregar(true);
    }
}

function sincronizarInputBaseHC(dataRef) {
    const inputBase = document.getElementById('global-base-hc');
    if (inputBase && Sistema.Dados) {
        // Obtém a base (Manual ou Padrão 17)
        const base = Sistema.Dados.obterBaseHC(dataRef);
        inputBase.value = base;
        
        // Dica visual: Se for diferente do padrão 17, destaca levemente
        if (base !== 17) {
            inputBase.style.fontWeight = '900';
            inputBase.style.color = '#2563eb'; // Azul
        } else {
            inputBase.style.fontWeight = 'bold';
            inputBase.style.color = '#334155'; // Slate
        }
    }
}

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
    
    const globalInput = document.getElementById('global-date');
    if(globalInput) globalInput.value = dataString;
    
    if (typeof Sistema !== 'undefined' && Sistema.Dados) {
        sincronizarInputBaseHC(dataString);
    }

    if (aba === 'geral') { 
        if(typeof Geral !== 'undefined') Geral.carregarTela(); 
    }
    
    if (aba === 'performance') { 
        if(typeof Perf !== 'undefined') Perf.carregarRanking(); 
    }
    
    if (aba === 'matriz') { 
        if(typeof Matriz !== 'undefined') Matriz.init(); 
    }
    
    if (aba === 'consolidado') { 
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
                    
                    atualizarDataGlobal(dataDoArquivo);
                    localStorage.setItem(KEY_TAB_GLOBAL, 'geral');
                    mudarAba('geral');
                }
            } else {
                alert("Nenhum usuário correspondente encontrado.");
            }
        } catch (err) { alert("Erro: " + err.message); } finally { input.value = ''; }
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', async () => {
    if(typeof Sistema !== 'undefined' && Sistema.Dados) {
        await Sistema.Dados.inicializar();
    }
    const lastTab = localStorage.getItem(KEY_TAB_GLOBAL) || 'geral';
    mudarAba(lastTab);
});