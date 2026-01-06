window.Produtividade = window.Produtividade || {
    supabase: null
};

Produtividade.init = async function() {
    if (window._supabase) {
        Produtividade.supabase = window._supabase;
    } else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        Produtividade.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = Produtividade.supabase;
    } else {
        return alert("Erro: Supabase não configurado.");
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

    const tabGeral = document.getElementById('tab-geral');
    if (tabGeral && !tabGeral.classList.contains('hidden') && Produtividade.Geral) {
        Produtividade.Geral.carregarTela();
    }
    // Adicionar refresh para outras abas se necessário
};

Produtividade.mudarAba = function(aba) {
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

// --- IMPORTAÇÃO EM MASSA ---
Produtividade.importarEmMassa = async function(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    if(!confirm(`Deseja importar ${files.length} arquivo(s)?`)) {
        input.value = ""; return;
    }

    // Carrega usuários uma vez
    const { data: usersDB, error: errUser } = await Produtividade.supabase.from('usuarios').select('id, nome');
    if(errUser) return alert("Erro ao carregar usuários: " + errUser.message);

    const mapUsuarios = {};
    const activeIds = new Set();
    usersDB.forEach(u => {
        mapUsuarios[Importacao.normalizar(u.nome)] = u.id;
        activeIds.add(u.id);
    });

    let totalImportados = 0;
    let arquivosProcessados = 0;
    let erros = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
            const leitura = await Importacao.lerArquivo(file);
            let dataRef = leitura.dataSugestionada;

            // Se não achou data no nome, usa a do painel (sem perguntar a cada arquivo para não travar o loop)
            if (!dataRef) {
                dataRef = document.getElementById('global-date').value;
            }

            const updates = [];
            
            leitura.dados.forEach(row => {
                const keys = Object.keys(row);
                const norm = Importacao.normalizar;
                
                // Mapeia colunas
                const getKey = (term) => keys.find(k => k.trim() === term || norm(k) === term || norm(k).includes(term));
                
                const kId = getKey('id_assistente');
                const kNome = getKey('assistente');
                
                // Ignora linhas sem identificação ou totais
                if (!kNome && !kId) return;
                const valNome = row[kNome] ? row[kNome].toString() : '';
                if (valNome.toLowerCase().includes('total')) return;

                const kTotal = getKey('documentos_validados') || getKey('total');
                const kFifo = getKey('documentos_validados_fifo') || getKey('fifo');
                const kGT = getKey('gradual_total');
                const kGP = getKey('gradual_parcial');
                const kPFC = getKey('perfil_fc');

                let uid = null;
                // Tenta por ID
                if (kId && row[kId]) {
                    const idVal = parseInt(row[kId]);
                    if (activeIds.has(idVal)) uid = idVal;
                }
                // Tenta por Nome
                if (!uid && kNome && row[kNome]) {
                    uid = mapUsuarios[norm(row[kNome])];
                }

                if (uid) {
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
                }
            });

            if (updates.length > 0) {
                const { error } = await Produtividade.supabase
                    .from('producao')
                    .upsert(updates, { onConflict: 'usuario_id, data_referencia' });
                
                if (error) throw error;
                totalImportados += updates.length;
                arquivosProcessados++;
            }

        } catch (err) {
            console.error(`Erro em ${file.name}:`, err);
            erros++;
        }
    }

    input.value = ""; // Limpa input
    
    alert(`Processo Finalizado!\n\n📂 Arquivos Processados: ${arquivosProcessados}\n✅ Registros Importados: ${totalImportados}\n❌ Arquivos com Erro: ${erros}`);
    
    // Atualiza tela se necessário
    if (Produtividade.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) {
        Produtividade.Geral.carregarTela();
    }
};

document.addEventListener('DOMContentLoaded', Produtividade.init);