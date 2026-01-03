// Variáveis globais para armazenar o estado
let usuarioLogado = null;
let dataSelecionada = new Date().toISOString().split('T')[0]; // Hoje por padrão

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Verifica Login
        const userStr = localStorage.getItem('usuario');
        if (!userStr) {
            window.location.href = 'index.html';
            return;
        }
        usuarioLogado = JSON.parse(userStr);

        // Atualiza nome no topo
        const nomeEl = document.getElementById('user-name');
        if (nomeEl) nomeEl.innerText = usuarioLogado.nome;

        // 2. Define data inicial nos inputs
        const dateInput = document.getElementById('filter-date');
        if (dateInput) {
            dateInput.value = dataSelecionada;
            dateInput.addEventListener('change', (e) => {
                dataSelecionada = e.target.value;
                carregarDados();
            });
        }

        // 3. Carrega dados iniciais
        await carregarDados();

    } catch (e) {
        console.error("Erro ao iniciar produtividade:", e);
        alert("Erro ao carregar sistema.");
    }
});

async function carregarDados() {
    if (!usuarioLogado) return;

    // Elementos da UI
    const elProducao = document.getElementById('stat-producao');
    const elMeta = document.getElementById('stat-meta');
    const elPercent = document.getElementById('stat-percent');
    const elAssert = document.getElementById('stat-assertividade'); // Novo campo de assertividade
    
    // Mostra loading
    if(elProducao) elProducao.innerText = "...";
    if(elMeta) elMeta.innerText = "...";

    try {
        // --- A. BUSCAR META VIGENTE NA DATA SELECIONADA ---
        // Lógica: Meta com data_inicio <= dataSelecionada. 
        // Ordenamos por data (decrescente) e pegamos a primeira (a mais recente válida).
        const { data: metas, error: errorMeta } = await _supabase
            .from('metas')
            .select('valor_meta, data_inicio')
            .eq('usuario_id', usuarioLogado.id)
            .lte('data_inicio', dataSelecionada) // Filtra metas futuras
            .order('data_inicio', { ascending: false }) // Pega a mais recente dentro do filtro
            .limit(1);

        if (errorMeta) throw errorMeta;

        // Se não tiver meta para essa data, assume 0
        const metaDoDia = (metas && metas.length > 0) ? metas[0].valor_meta : 0;


        // --- B. BUSCAR PRODUÇÃO DO DIA ---
        const { data: producao, error: errorProd } = await _supabase
            .from('producao_diaria')
            .select('quantidade_produzida, erros_cometidos')
            .eq('usuario_id', usuarioLogado.id)
            .eq('data_producao', dataSelecionada)
            .maybeSingle();

        if (errorProd) throw errorProd;

        const qtdFeita = producao ? producao.quantidade_produzida : 0;
        const erros = producao ? producao.erros_cometidos : 0;

        // --- C. CÁLCULOS E ATUALIZAÇÃO DA TELA ---
        
        // 1. Meta e Produção
        if(elProducao) elProducao.innerText = qtdFeita;
        if(elMeta) elMeta.innerText = metaDoDia;

        // 2. Percentual de Conclusão da Meta
        let percent = 0;
        if (metaDoDia > 0) {
            percent = (qtdFeita / metaDoDia) * 100;
        }
        
        if(elPercent) {
            elPercent.innerText = percent.toFixed(1) + '%';
            // Muda cor dependendo do atingimento
            if(percent >= 100) {
                elPercent.className = "text-2xl font-bold text-emerald-600";
            } else if (percent >= 80) {
                elPercent.className = "text-2xl font-bold text-yellow-500";
            } else {
                elPercent.className = "text-2xl font-bold text-red-500";
            }
        }

        // 3. Assertividade (Comparação com Meta Global)
        // Assertividade = 100 - ( (Erros / Produção) * 100 )
        let assertividade = 100;
        if (qtdFeita > 0) {
            const taxaErro = (erros / qtdFeita) * 100;
            assertividade = 100 - taxaErro;
        } else if (erros > 0) {
            // Se produziu 0 mas teve erros, assertividade é 0
            assertividade = 0; 
        }

        // Busca Meta de Assertividade Global VIGENTE
        const { data: metaAssert, error: errAss } = await _supabase
            .from('metas_assertividade')
            .select('valor_minimo')
            .lte('data_inicio', dataSelecionada)
            .order('data_inicio', { ascending: false })
            .limit(1);
            
        const metaAssertValor = (metaAssert && metaAssert.length > 0) ? metaAssert[0].valor_minimo : 97.0; // Padrão 97 se não houver

        if(elAssert) {
            elAssert.innerText = assertividade.toFixed(2) + '%';
            
            // Cor baseada na meta global (verde se >= meta, vermelho se < meta)
            if(assertividade >= metaAssertValor) {
                elAssert.classList.remove('text-red-500');
                elAssert.classList.add('text-emerald-600');
            } else {
                elAssert.classList.remove('text-emerald-600');
                elAssert.classList.add('text-red-500');
            }
        }

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}