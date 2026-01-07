window.Produtividade = window.Produtividade || { supabase: null };

Produtividade.init = async function() {
    if (window._supabase) {
        Produtividade.supabase = window._supabase;
    } else if (window.supabase) {
        Produtividade.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = Produtividade.supabase;
    }

    if(window.Sistema && Sistema.Dados) await Sistema.Dados.inicializar();

    const dateInput = document.getElementById('global-date');
    if (dateInput) {
        const storedDate = localStorage.getItem('produtividade_data_ref');
        dateInput.value = storedDate || new Date().toISOString().split('T')[0];
    }

    Produtividade.mudarAba('geral');
};

Produtividade.atualizarDataGlobal = function(novaData) {
    if (!novaData) return;
    localStorage.setItem('produtividade_data_ref', novaData);
    
    const dateInput = document.getElementById('global-date');
    if (dateInput && dateInput.value !== novaData) {
        dateInput.value = novaData;
    }

    if (Produtividade.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) {
        Produtividade.Geral.carregarTela();
    }
};

Produtividade.mudarAba = function(aba) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    if (aba === 'geral') {
        document.getElementById('ctrl-geral').classList.remove('hidden');
        if(Produtividade.Geral) Produtividade.Geral.carregarTela();
    } 
    else if (aba === 'consolidado') {
        document.getElementById('ctrl-consolidado').classList.remove('hidden');
        if(Produtividade.Consolidado) Produtividade.Consolidado.init();
    } 
    else if (aba === 'performance') {
        document.getElementById('ctrl-performance').classList.remove('hidden');
        if(Produtividade.Performance) Produtividade.Performance.init();
    } 
    else if (aba === 'matriz') {
        if(Produtividade.Matriz) Produtividade.Matriz.init();
    }
};

Produtividade.importarEmMassa = async function(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    if(!confirm(`Importar ${files.length} arquivo(s)?`)) { input.value = ""; return; }

    // 1. Busca usuários e IDs válidos
    const { data: usersDB } = await Produtividade.supabase.from('usuarios').select('id, nome');
    
    const validIds = new Set((usersDB || []).map(u => u.id)); // Lista rápida de IDs
    const mapUsuarios = {}; // Mapa Nome -> ID (para fallback)
    (usersDB || []).forEach(u => mapUsuarios[Importacao.normalizar(u.nome)] = u.id);

    let totalImportados = 0;
    let erros = 0;
    let naoEncontrados = []; // Log de erros
    let ultimaDataDetectada = null;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const leitura = await Importacao.lerArquivo(file);
            let dataRef = leitura.dataSugestionada || document.getElementById('global-date').value;
            if (leitura.dataSugestionada) ultimaDataDetectada = leitura.dataSugestionada;

            const updates = [];
            
            leitura.dados.forEach(row => {
                const keys = Object.keys(row);
                const norm = Importacao.normalizar;
                const findKey = (t) => keys.find(k => k.trim() === t || norm(k) === t || norm(k).includes(t));

                // Colunas de Identificação
                const kId = findKey('id') || findKey('id_assistente') || findKey('matricula');
                const kNome = findKey('assistente') || findKey('nome');

                // Pula linha de Total ou Vazia
                if ((!kId && !kNome) || (row[kNome] && row[kNome].toString().toLowerCase().includes('total'))) return;

                let uid = null;
                const nomeRaw = row[kNome] ? row[kNome].toString() : "";

                // ESTRATÉGIA 1: Tenta pelo ID (Prioridade Máxima) 🏆
                if (kId && row[kId]) {
                    // Remove pontos e converte pra número (ex: "1.074.360" -> 1074360)
                    const idLimpo = parseInt(row[kId].toString().replace(/\./g, '').trim());
                    if (validIds.has(idLimpo)) {
                        uid = idLimpo;
                    }
                }

                // ESTRATÉGIA 2: Se falhar o ID, tenta pelo Nome (Fallback Inteligente)
                if (!uid && nomeRaw) {
                    const nomeBusca = norm(nomeRaw);
                    uid = mapUsuarios[nomeBusca]; // Match exato

                    // Match flexível (Primeiro nome ou Contém)
                    if (!uid && nomeBusca.length > 2) {
                        const primeiroNome = nomeBusca.split(' ')[0];
                        const matchUser = usersDB.find(u => {
                            const dbNome = norm(u.nome);
                            return dbNome === nomeBusca || 
                                   dbNome.includes(nomeBusca) || 
                                   (dbNome.split(' ')[0] === primeiroNome && nomeBusca.split(' ')[0] === primeiroNome);
                        });
                        if (matchUser) uid = matchUser.id;
                    }
                }

                // Mapeamento das Métricas
                const kTotal = keys.find(k => k === 'documentos_validados') || findKey('total') || findKey('qtd');
                const kFifo = keys.find(k => k === 'documentos_validados_fifo') || findKey('fifo');
                const kGT = keys.find(k => k === 'documentos_validados_gradual_total') || findKey('gradual_total');
                const kGP = keys.find(k => k === 'documentos_validados_gradual_parcial') || findKey('gradual_parcial');
                const kPFC = keys.find(k => k === 'documentos_validados_perfil_fc') || findKey('perfil_fc');

                if (uid) {
                    const pInt = (v) => {
                        if (typeof v === 'number') return v;
                        if (!v) return 0;
                        const s = v.toString().trim().replace(/\./g, '').replace(',', '.');
                        return parseInt(s) || 0;
                    };

                    updates.push({
                        usuario_id: uid,
                        data_referencia: dataRef,
                        quantidade: pInt(row[kTotal]),
                        fifo: pInt(row[kFifo]),
                        gradual_total: pInt(row[kGT]),
                        gradual_parcial: pInt(row[kGP]),
                        perfil_fc: pInt(row[kPFC])
                    });
                } else {
                    // Se não achou nem por ID nem por Nome, registra erro
                    const ident = row[kId] ? `ID: ${row[kId]}` : (nomeRaw || "Linha desconhecida");
                    if(!naoEncontrados.includes(ident)) naoEncontrados.push(ident);
                }
            });

            if (updates.length > 0) {
                await Produtividade.supabase
                    .from('producao')
                    .upsert(updates, { onConflict: 'usuario_id, data_referencia' });
                totalImportados += updates.length;
            }

        } catch (err) {
            console.error(err);
            erros++;
        }
    }

    input.value = "";
    
    let msg = `Importação finalizada!\nRegistros salvos: ${totalImportados}`;
    if (erros > 0) msg += `\nArquivos com erro: ${erros}`;
    if (naoEncontrados.length > 0) {
        msg += `\n\n⚠️ Não encontrados (${naoEncontrados.length}):\n` + 
               naoEncontrados.slice(0, 5).join(', ') + 
               (naoEncontrados.length > 5 ? '...' : '');
    }
    alert(msg);
    
    if (ultimaDataDetectada) {
        Produtividade.atualizarDataGlobal(ultimaDataDetectada);
    } else if (Produtividade.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) {
        Produtividade.Geral.carregarTela();
    }
};

document.addEventListener('DOMContentLoaded', Produtividade.init);