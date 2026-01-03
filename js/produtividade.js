let usuarioLogado = null;
let dataSelecionada = new Date().toISOString().split('T')[0];
let meuGrafico = null; // Variável para guardar a instância do gráfico

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verifica Login
    const userStr = localStorage.getItem('usuario');
    if (!userStr) { window.location.href = 'index.html'; return; }
    usuarioLogado = JSON.parse(userStr);

    // 2. Configura Inputs
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
        dateInput.value = dataSelecionada;
        dateInput.addEventListener('change', (e) => {
            dataSelecionada = e.target.value;
            carregarDados();
        });
    }

    // 3. Inicializa Gráfico Vazio
    initChart();

    // 4. Carrega Dados
    await carregarDados();
});

// --- FUNÇÃO DE CARREGAMENTO (COM A CORREÇÃO DE LÓGICA) ---
async function carregarDados() {
    if (!usuarioLogado) return;
    
    // Reset visual
    document.getElementById('btn-salvar').disabled = true;
    document.getElementById('display-meta').innerText = "...";

    try {
        // A. BUSCAR META CORRETA (FIX: Lógica de data corrigida)
        const { data: metas, error: errorMeta } = await _supabase
            .from('metas')
            .select('*')
            .eq('usuario_id', usuarioLogado.id)
            .lte('data_inicio', dataSelecionada) // Meta deve ter começado ANTES ou HOJE
            .order('data_inicio', { ascending: false }) // Pega a mais recente válida
            .limit(1);

        const metaValor = (metas && metas.length > 0) ? metas[0].valor_meta : 0;
        document.getElementById('display-meta').innerText = metaValor;

        // B. BUSCAR PRODUÇÃO DO DIA
        const { data: prod, error: errorProd } = await _supabase
            .from('producao_diaria')
            .select('*')
            .eq('usuario_id', usuarioLogado.id)
            .eq('data_producao', dataSelecionada)
            .maybeSingle();

        // Valores atuais
        const qtd = prod ? prod.quantidade_produzida : 0;
        const erros = prod ? prod.erros_cometidos : 0;

        // Preenche os inputs para o utilizador poder editar
        document.getElementById('nova-producao').value = qtd > 0 ? qtd : '';
        document.getElementById('nova-erros').value = erros > 0 ? erros : '';

        // C. CALCULAR ASSERTIVIDADE E ATUALIZAR TELA
        let assertividade = 100;
        if (qtd > 0) {
            assertividade = 100 - ((erros / qtd) * 100);
        } else if (erros > 0) {
            assertividade = 0;
        }
        
        const elAssert = document.getElementById('display-assertividade');
        if(elAssert) {
            elAssert.innerText = assertividade.toFixed(1) + '%';
            elAssert.className = assertividade >= 97 ? "text-2xl font-black text-emerald-600" : "text-2xl font-black text-red-500";
        }

        // D. ATUALIZAR GRÁFICO
        atualizarGrafico(qtd, metaValor);

    } catch (err) {
        console.error("Erro ao carregar:", err);
        alert("Erro ao sincronizar dados.");
    } finally {
        document.getElementById('btn-salvar').disabled = false;
    }
}

// --- FUNÇÃO DE SALVAR (RESTAURADA) ---
async function salvarProducao() {
    const qtd = document.getElementById('nova-producao').value;
    const erros = document.getElementById('nova-erros').value || 0;
    const btn = document.getElementById('btn-salvar');

    if (!qtd) return alert("Insira a quantidade produzida.");

    btn.innerText = "A guardar...";
    btn.disabled = true;

    try {
        // Verifica se já existe registo hoje para fazer Upsert (Inserir ou Atualizar)
        // Primeiro tentamos selecionar para pegar o ID se existir
        const { data: existente } = await _supabase
            .from('producao_diaria')
            .select('id')
            .eq('usuario_id', usuarioLogado.id)
            .eq('data_producao', dataSelecionada)
            .maybeSingle();

        let error = null;

        if (existente) {
            // Atualiza
            const { error: errUp } = await _supabase
                .from('producao_diaria')
                .update({ 
                    quantidade_produzida: parseInt(qtd),
                    erros_cometidos: parseInt(erros)
                })
                .eq('id', existente.id);
            error = errUp;
        } else {
            // Insere Novo
            const { error: errIns } = await _supabase
                .from('producao_diaria')
                .insert({
                    usuario_id: usuarioLogado.id,
                    data_producao: dataSelecionada,
                    quantidade_produzida: parseInt(qtd),
                    erros_cometidos: parseInt(erros)
                });
            error = errIns;
        }

        if (error) throw error;
        
        await carregarDados(); // Recarrega para confirmar e atualizar gráfico
        alert("Dados salvos com sucesso!");

    } catch (e) {
        alert("Erro ao salvar: " + e.message);
    } finally {
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Dados';
        btn.disabled = false;
    }
}

// --- CONFIGURAÇÃO DO GRÁFICO (CHART.JS) ---
function initChart() {
    const ctx = document.getElementById('prodChart').getContext('2d');
    meuGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Meta', 'Realizado'],
            datasets: [{
                label: 'Documentos',
                data: [0, 0],
                backgroundColor: ['#e2e8f0', '#3b82f6'], // Cinza para Meta, Azul para Realizado
                borderRadius: 8,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [5, 5] } }
            }
        }
    });
}

function atualizarGrafico(qtd, meta) {
    if (!meuGrafico) return;

    meuGrafico.data.datasets[0].data = [meta, qtd];
    
    // Muda a cor se atingiu a meta
    let corRealizado = '#3b82f6'; // Azul padrão
    let textoStatus = "Em andamento";
    
    if (meta > 0) {
        if (qtd >= meta) {
            corRealizado = '#10b981'; // Verde Sucesso
            textoStatus = "Meta Batida! 🚀";
            document.getElementById('lbl-status').className = "bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full";
        } else {
            const pct = (qtd/meta)*100;
            textoStatus = `${pct.toFixed(0)}% da Meta`;
            document.getElementById('lbl-status').className = "bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full";
        }
    }
    
    meuGrafico.data.datasets[0].backgroundColor = ['#e2e8f0', corRealizado];
    document.getElementById('lbl-status').innerText = textoStatus;
    
    meuGrafico.update();
}