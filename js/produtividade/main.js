const Produtividade = {
    supabase: null,

    init: async function() {
        if (window._supabase) {
            Produtividade.supabase = window._supabase;
        } else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            Produtividade.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = Produtividade.supabase;
        } else {
            return alert("Erro: Supabase não configurado.");
        }

        // Recupera data
        const dateInput = document.getElementById('global-date');
        const storedDate = localStorage.getItem('produtividade_data_ref');
        if (storedDate) dateInput.value = storedDate;
        else dateInput.value = new Date().toISOString().split('T')[0];

        // Carrega aba inicial
        Produtividade.mudarAba('geral');
    },

    atualizarDataGlobal: function(novaData) {
        if (!novaData) return;
        localStorage.setItem('produtividade_data_ref', novaData);
        // Refresh na aba ativa
        if (!document.getElementById('tab-geral').classList.contains('hidden')) Produtividade.Geral.carregarTela();
        // Adicione outros refreshes se necessário
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab-${aba}`).classList.remove('hidden');
        document.getElementById(`btn-${aba}`).classList.add('active');

        ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.add('hidden');
        });

        if (aba === 'geral') {
            document.getElementById('ctrl-geral').classList.remove('hidden');
            Produtividade.Geral.carregarTela();
        } 
        else if (aba === 'consolidado') {
            document.getElementById('ctrl-consolidado').classList.remove('hidden');
            Produtividade.Consolidado.init();
        }
        else if (aba === 'performance') {
            document.getElementById('ctrl-performance').classList.remove('hidden');
            Produtividade.Performance.init();
        }
        else if (aba === 'matriz') {
            Produtividade.Matriz.init();
        }
    },

    // --- LÓGICA DE IMPORTAÇÃO ESPECÍFICA DE PRODUTIVIDADE ---
    importarExcel: async function(input) {
        if (!input.files || input.files.length === 0) return;

        try {
            // 1. Ler arquivo
            const leitura = await Importacao.lerArquivo(input);
            let dataRef = leitura.dataSugestionada;

            // 2. Validar Data
            if (dataRef) {
                const dataFmt = dataRef.split('-').reverse().join('/');
                if (!confirm(`Arquivo detectado com data ${dataFmt}. Confirmar importação?`)) {
                    dataRef = document.getElementById('global-date').value;
                }
            } else {
                dataRef = document.getElementById('global-date').value;
                if(!confirm("Data não detectada no nome do arquivo. Usar data do painel?")) {
                    input.value = ""; return;
                }
            }

            // Atualiza visualmente
            document.getElementById('global-date').value = dataRef;
            Produtividade.atualizarDataGlobal(dataRef);

            // 3. Processar Dados (Lógica Específica restaurada)
            const { data: usuariosDb } = await Produtividade.supabase.from('usuarios').select('id, nome');
            const mapUsuarios = {};
            usuariosDb.forEach(u => mapUsuarios[Importacao.normalizar(u.nome)] = u.id);

            const updates = [];
            const naoEncontrados = [];

            leitura.dados.forEach(row => {
                // Ignora totais
                const rowStr = JSON.stringify(row).toLowerCase();
                if(rowStr.includes('total geral')) return;

                const keys = Object.keys(row);
                const norm = Importacao.normalizar;

                // Mapeamento Inteligente
                // Procura coluna que contenha "assistente" ou "nome", mas prioriza ID se tiver
                const kId = keys.find(k => k.trim() === 'id_assistente'); 
                const kNome = keys.find(k => norm(k).includes('assistente') || norm(k).includes('nome'));
                
                // Métricas
                const kTotal = keys.find(k => k.trim() === 'documentos_validados' || norm(k) === 'total');
                const kFifo = keys.find(k => norm(k).includes('fifo'));
                const kGT = keys.find(k => norm(k).includes('gradual_total'));
                const kGP = keys.find(k => norm(k).includes('gradual_parcial'));
                const kPFC = keys.find(k => norm(k).includes('perfil_fc'));

                if (!kNome && !kId) return;

                // Tenta achar usuário
                let uid = null;
                // 1. Pelo ID na planilha (mais seguro)
                if (kId && row[kId]) {
                    // Verifica se esse ID existe no banco (procura na lista carregada)
                    const exists = usuariosDb.find(u => u.id == row[kId]);
                    if (exists) uid = exists.id;
                }
                // 2. Pelo Nome (Fuzzy match simples)
                if (!uid && kNome && row[kNome]) {
                    uid = mapUsuarios[norm(row[kNome])];
                }

                if (uid) {
                    const parseVal = (v) => {
                        if(typeof v === 'number') return v;
                        if(!v) return 0;
                        return parseInt(v.toString().replace(/\./g, '')) || 0;
                    };

                    updates.push({
                        usuario_id: uid,
                        data_referencia: dataRef,
                        quantidade: parseVal(row[kTotal]),
                        fifo: parseVal(row[kFifo]),
                        gradual_total: parseVal(row[kGT]),
                        gradual_parcial: parseVal(row[kGP]),
                        perfil_fc: parseVal(row[kPFC])
                    });
                } else {
                    if(row[kNome] && row[kNome].toString().toLowerCase() !== 'total') {
                        naoEncontrados.push(row[kNome]);
                    }
                }
            });

            // 4. Enviar ao Banco
            if (updates.length > 0) {
                const { error } = await Produtividade.supabase
                    .from('producao')
                    .upsert(updates, { onConflict: 'usuario_id, data_referencia' });
                
                if (error) throw error;

                let msg = `✅ Importação concluída! ${updates.length} registros processados.`;
                if (naoEncontrados.length > 0) {
                    msg += `\n\n⚠️ ${naoEncontrados.length} nomes não encontrados (verifique o cadastro em Gestão).`;
                }
                alert(msg);
                Produtividade.Geral.carregarTela();
            } else {
                alert("Nenhum dado válido encontrado para importar.");
            }

        } catch (erro) {
            console.error(erro);
            alert("Erro na importação: " + erro.message);
        } finally {
            input.value = "";
        }
    }
};

document.addEventListener('DOMContentLoaded', Produtividade.init);