// js/produtividade.js

let usuarioLogado = null;
// Define data inicial como hoje (Formato YYYY-MM-DD)
let dataSelecionada = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificação de Segurança (Login)
    const userStr = localStorage.getItem('usuario');
    if (!userStr) {
        window.location.href = 'index.html'; // Manda para login se não tiver sessão
        return;
    }
    
    usuarioLogado = JSON.parse(userStr);
    
    // Tenta atualizar o nome do usuário no layout, se existir o elemento
    const nomeEl = document.getElementById('user-name');
    if (nomeEl) nomeEl.innerText = usuarioLogado.nome;

    // 2. Configura o Input de Data
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
        dateInput.value = dataSelecionada;
        dateInput.addEventListener('change', (e) => {
            if(e.target.value) {
                dataSelecionada = e.target.value;
                carregarDados();
            }
        });
    }

    // 3. Inicia o carregamento
    await carregarDados();
});

async function carregarDados() {
    if (!usuarioLogado) return;
    
    // Verifica se Supabase está carregado
    if (typeof _supabase === 'undefined') {
        console.error("Supabase não inicializado.");
        alert("Erro de conexão. Verifique o config.js");
        return;
    }

    // Elementos da Interface
    const elProducao = document.getElementById('stat-producao');
    const elMeta = document.getElementById('stat-meta');
    const elPercent = document.getElementById('stat-percent');
    const elAssert = document.getElementById('stat-assertividade');

    // Feedback visual de carregamento
    if(elProducao) elProducao.innerText = "...";
    if(elMeta) elMeta.innerText = "...";
    if(elPercent) elPercent.innerText = "...";
    if(elAssert) elAssert.innerText = "...";

    try {
        console.log("Buscando dados para:", dataSelecionada, "Usuário:", usuarioLogado.nome);

        // --- 1. BUSCAR META DE PRODUÇÃO ---
        // (Lógica corrigida: Pega a meta vigente mais recente)
        const { data: metas, error: errorMeta } = await _supabase
            .from('metas')
            .select('*')
            .eq('usuario_id', usuarioLogado.id)
            .lte('data_inicio', dataSelecionada) // Apenas metas que já começaram
            .order('data_inicio', { ascending: false }) // A mais recente primeiro
            .limit(1);

        if (errorMeta) throw new Error("Erro ao buscar metas: " + errorMeta.message);

        // Se não houver meta, assume 0
        const metaDoDia = (metas && metas.length > 0) ? metas[0].valor_meta : 0;


        // --- 2. BUSCAR PRODUÇÃO REALIZADA ---
        const { data: producao, error: errorProd } = await _supabase
            .from('producao_diaria')
            .select('*')
            .eq('usuario_id', usuarioLogado.id)
            .eq('data_producao', dataSelecionada)
            .maybeSingle();

        if (errorProd) throw new Error("Erro ao buscar produção: " + errorProd.message);

        const qtdFeita = producao ? producao.quantidade_produzida : 0;
        const erros = producao ? producao.erros_cometidos : 0;


        // --- 3. ATUALIZAR TELA (PRODUÇÃO E META) ---
        if(elProducao) elProducao.innerText = qtdFeita;
        if(elMeta) elMeta.innerText = metaDoDia;

        // Cálculo Percentual
        let percent = 0;
        if (metaDoDia > 0) percent = (qtdFeita / metaDoDia) * 100;
        
        if(elPercent) {
            elPercent.innerText = percent.toFixed(1) + '%';
            
            // Definição de Cores
            elPercent.className = "text-3xl font-black transition-colors duration-500"; // Reset classes
            if (percent >= 100) elPercent.classList.add("text-emerald-500");
            else if (percent >= 80) elPercent.classList.add("text-yellow-500");
            else elPercent.classList.add("text-slate-300"); // Cor neutra para baixo desempenho ou 0
        }


        // --- 4. BUSCAR META DE ASSERTIVIDADE (Try/Catch Isolado) ---
        // Isolamos isto para que, se falhar (tabela não existir), não trave o resto
        try {
            const { data: metaAssert, error: errAss } = await _supabase
                .from('metas_assertividade')
                .select('valor_minimo')
                .lte('data_inicio', dataSelecionada)
                .order('data_inicio', { ascending: false })
                .limit(1);

            if (errAss) throw errAss;

            const metaAssertValor = (metaAssert && metaAssert.length > 0) ? metaAssert[0].valor_minimo : 97.0;

            // Cálculo Assertividade Realizada
            let assertividade = 100;
            if (qtdFeita > 0) {
                assertividade = 100 - ((erros / qtdFeita) * 100);
            } else if (erros > 0) {
                assertividade = 0; // Teve erros sem produção
            }

            if(elAssert) {
                elAssert.innerText = assertividade.toFixed(2) + '%';
                
                elAssert.className = "text-3xl font-black transition-colors duration-500";
                if (assertividade >= metaAssertValor) {
                    elAssert.classList.add("text-emerald-500");
                } else {
                    elAssert.classList.add("text-red-400");
                }
            }

        } catch (erroAssert) {
            console.warn("Aviso: Não foi possível carregar assertividade (tabela pode não existir).", erroAssert);
            if(elAssert) elAssert.innerText = "-";
        }

    } catch (err) {
        console.error("ERRO CRÍTICO NO CARREGAMENTO:", err);
        // Mostra erro na tela se falhar tudo
        if(elProducao) elProducao.innerText = "Erro";
        if(elMeta) elMeta.innerText = "Erro";
        alert("Erro ao carregar dados: " + err.message);
    }
}