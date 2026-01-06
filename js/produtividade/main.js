window.Produtividade = window.Produtividade || {
    supabase: null
};

Produtividade.init = async function() {
    // 1. Configuração do Supabase (Reutiliza a conexão global)
    if (window._supabase) {
        Produtividade.supabase = window._supabase;
    } else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        Produtividade.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = Produtividade.supabase;
    } else {
        console.error("Supabase não configurado.");
        return;
    }

    // 2. Inicializa sistema global de dados (se houver)
    if(window.Sistema && Sistema.Dados) await Sistema.Dados.inicializar();

    // 3. Define a data inicial no input
    const dateInput = document.getElementById('global-date');
    if (dateInput) {
        const storedDate = localStorage.getItem('produtividade_data_ref');
        dateInput.value = storedDate || new Date().toISOString().split('T')[0];
    }

    // 4. Inicia na aba Geral
    Produtividade.mudarAba('geral');
};

Produtividade.atualizarDataGlobal = function(novaData) {
    if (!novaData) return;
    localStorage.setItem('produtividade_data_ref', novaData);

    const tabGeral = document.getElementById('tab-geral');
    // Se a aba geral estiver visível e o módulo carregado, recarrega a tela
    if (tabGeral && !tabGeral.classList.contains('hidden') && Produtividade.Geral) {
        Produtividade.Geral.carregarTela();
    }
};

Produtividade.mudarAba = function(aba) {
    // Esconde todas as seções
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Mostra a selecionada
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    // Gerencia controles do topo (filtros específicos)
    ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    if (aba === 'geral') {
        const ctrl = document.getElementById('ctrl-geral');
        if(ctrl) ctrl.classList.remove('hidden');
        if(Produtividade.Geral) Produtividade.Geral.carregarTela();
    } 
    else if (aba === 'consolidado') {
        const ctrl = document.getElementById('ctrl-consolidado');
        if(ctrl) ctrl.classList.remove('hidden');
        if(Produtividade.Consolidado) Produtividade.Consolidado.init();
    } 
    else if (aba === 'performance') {
        const ctrl = document.getElementById('ctrl-performance');
        if(ctrl) ctrl.classList.remove('hidden');
        if(Produtividade.Performance) Produtividade.Performance.init();
    } 
    else if (aba === 'matriz') {
        if(Produtividade.Matriz) Produtividade.Matriz.init();
    }
};

// --- FUNÇÃO DE IMPORTAÇÃO COMPLETA ---
Produtividade.importarExcel = async function(input) {
    if (!input.files || input.files.length === 0) return;

    try {
        // 1. Ler o arquivo usando o Importacao.js
        const resultadoLeitura = await Importacao.lerArquivo(input);
        let dataRef = resultadoLeitura.dataSugestionada;
        
        // 2. Validação da Data
        if (dataRef) {
            const dataFmt = dataRef.split('-').reverse().join('/');
            if (!confirm(`O arquivo parece ser do dia ${dataFmt}. Confirmar importação para esta data?`)) {
                dataRef = document.getElementById('global-date').value;
            }
        } else {
            dataRef = document.getElementById('global-date').value;
            if(!confirm(`Data não detectada no nome do arquivo. Importar para a data selecionada no painel (${dataRef.split('-').reverse().join('/')})?`)) {
                input.value = ""; return;
            }
        }

        // Atualiza a interface
        document.getElementById('global-date').value = dataRef;
        Produtividade.atualizarDataGlobal(dataRef);

        // 3. Buscar Usuários para Mapeamento
        const { data: usersDB, error: errUser } = await Produtividade.supabase
            .from('usuarios')
            .select('id, nome');
            
        if(errUser) throw errUser;

        const mapUsuarios = {}; // Mapa Nome -> ID
        const activeIds = new Set(); // Conjunto de IDs válidos
        
        usersDB.forEach(u => {
            mapUsuarios[Importacao.normalizar(u.nome)] = u.id;
            activeIds.add(u.id);
        });

        const updates = [];
        const naoEncontrados = [];

        // 4. Processar linhas do Excel
        for (const row of resultadoLeitura.dados) {
            // Ignora linhas de totalização
            const rowStr = Object.values(row).join('').toLowerCase();
            if (rowStr.includes('total') && !rowStr.includes('gradual')) continue;

            const keys = Object.keys(row);
            const norm = Importacao.normalizar;
            
            // Função auxiliar para encontrar a chave correta ignorando maiúsculas/acentos
            const getKey = (term) => keys.find(k => k.trim() === term || norm(k) === term || norm(k).includes(term));

            // Mapeamento das Colunas (Baseado no seu arquivo 05012026.xlsx)
            const kId = keys.find(k => k.trim() === 'id_assistente') || getKey('id_assistente');
            const kNome = keys.find(k => k.trim() === 'assistente') || getKey('assistente');
            
            // Métricas
            const kTotal = keys.find(k => k.trim() === 'documentos_validados') || getKey('total');
            const kFifo = keys.find(k => k.trim() === 'documentos_validados_fifo') || getKey('fifo');
            const kGT = keys.find(k => k.trim() === 'documentos_validados_gradual_total') || getKey('gradual_total');
            const kGP = keys.find(k => k.trim() === 'documentos_validados_gradual_parcial') || getKey('gradual_parcial');
            const kPFC = keys.find(k => k.trim() === 'documentos_validados_perfil_fc') || getKey('perfil_fc');

            if (!kNome && !kId) continue;

            // Identificação do Usuário
            let uid = null;
            
            // Tenta pelo ID primeiro (Mais seguro)
            if (kId && row[kId]) {
                const idVal = parseInt(row[kId]);
                if (activeIds.has(idVal)) uid = idVal;
            }

            // Se falhar, tenta pelo Nome
            if (!uid && kNome && row[kNome]) {
                const nomeLimpo = norm(row[kNome]);
                if (nomeLimpo === 'total') continue;
                uid = mapUsuarios[nomeLimpo];
            }

            if (uid) {
                // Parse seguro de números
                const pInt = (v) => {
                    if (typeof v === 'number') return v;
                    if (!v) return 0;
                    const s = v.toString().replace(/\./g, '').replace(',', '.');
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
                if (row[kNome]) naoEncontrados.push(row[kNome]);
            }
        }

        // 5. Enviar para o Banco
        if (updates.length > 0) {
            const { error } = await Produtividade.supabase
                .from('producao')
                .upsert(updates, { onConflict: 'usuario_id, data_referencia' });

            if (error) throw error;

            let msg = `✅ Importação concluída! ${updates.length} registros processados.`;
            if (naoEncontrados.length > 0) {
                msg += `\n\n⚠️ Atenção: ${naoEncontrados.length} nomes não foram encontrados no cadastro (Verifique a aba Gestão).`;
                // Exibe os primeiros nomes no console para debug
                console.warn("Nomes não encontrados:", naoEncontrados);
            }
            alert(msg);
            
            // Recarrega a tela se estiver na aba geral
            if(Produtividade.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) {
                Produtividade.Geral.carregarTela();
            }
        } else {
            alert("⚠️ Nenhum dado válido encontrado. Verifique se o arquivo corresponde ao modelo esperado.");
        }

    } catch (erro) {
        console.error(erro);
        alert("❌ Erro na importação: " + erro.message);
    } finally {
        input.value = ""; // Limpa o input para permitir importar o mesmo arquivo novamente
    }
};

document.addEventListener('DOMContentLoaded', Produtividade.init);