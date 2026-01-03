document.addEventListener('DOMContentLoaded', init);

let currentUser = null;
let currentMetaProducao = 0;
let currentMetaAssertividade = 0;

async function init() {
    // 1. Verificar Login
    const session = localStorage.getItem('user_session');
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(session);

    // 2. Definir data de hoje no input
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('data-registo');
    dateInput.value = today;

    // 3. Adicionar evento de mudança de data
    dateInput.addEventListener('change', carregarDadosDoDia);

    // 4. Carregar dados iniciais
    await carregarDadosDoDia();
}

async function carregarDadosDoDia() {
    const dataSelecionada = document.getElementById('data-registo').value;
    if (!dataSelecionada) return;

    resetUI(); // Limpa os valores visuais enquanto carrega

    try {
        // --- A. Buscar Meta de Produção (Histórico) ---
        // Queremos a meta cuja data_inicio seja menor ou igual à data selecionada.
        // Ordenamos descrescente e pegamos a primeira (a mais recente válida para aquele dia).
        const { data: metasProd, error: errMeta } = await _supabase
            .from('metas')
            .select('valor_meta')
            .eq('usuario_id', currentUser.id)
            .lte('data_inicio', dataSelecionada) 
            .order('data_inicio', { ascending: false })
            .limit(1);

        if (metasProd && metasProd.length > 0) {
            currentMetaProducao = metasProd[0].valor_meta;
            document.getElementById('display-meta-prod').innerText = currentMetaProducao;
        } else {
            currentMetaProducao = 0;
            document.getElementById('display-meta-prod').innerText = "N/D";
        }

        // --- B. Buscar Meta de Assertividade (Global) ---
        // Mesma lógica de datas
        const { data: metasAss, error: errAss } = await _supabase
            .from('metas_assertividade')
            .select('valor_minimo')
            .lte('data_inicio', dataSelecionada)
            .order('data_inicio', { ascending: false })
            .limit(1);

        if (metasAss && metasAss.length > 0) {
            currentMetaAssertividade = metasAss[0].valor_minimo;
            document.getElementById('display-meta-assert').innerText = currentMetaAssertividade + "%";
        } else {
            currentMetaAssertividade = 0;
            document.getElementById('display-meta-assert').innerText = "N/D";
        }

        // --- C. Buscar Produção Já Lançada ---
        const { data: producao, error: errProd } = await _supabase
            .from('producao') // Assumindo que a tabela se chama 'producao'
            .select('*')
            .eq('usuario_id', currentUser.id)
            .eq('data', dataSelecionada)
            .maybeSingle();

        const statusIcon = document.getElementById('status-icon');
        const statusText = document.getElementById('status-text');
        const inputQtd = document.getElementById('input-qtd');
        const btn = document.getElementById('btn-salvar');

        if (producao) {
            // Se já existe produção
            inputQtd.value = producao.quantidade;
            
            // Verifica se bateu a meta
            if (currentMetaProducao > 0 && producao.quantidade >= currentMetaProducao) {
                statusIcon.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i>';
                statusText.innerHTML = `<span class="text-emerald-600">Meta Atingida!</span>`;
                statusText.className = "text-sm font-bold text-emerald-600";
            } else {
                statusIcon.innerHTML = '<i class="fas fa-adjust text-amber-500"></i>';
                statusText.innerHTML = 'Registo encontrado.<br>Pode editar abaixo.';
                statusText.className = "text-sm font-bold text-amber-600";
            }
            btn.innerHTML = '<span>✏️ Atualizar Registo</span>';
            btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            btn.classList.add('bg-amber-600', 'hover:bg-amber-700');

        } else {
            // Nada lançado ainda
            inputQtd.value = '';
            statusIcon.innerHTML = '<i class="fas fa-clock text-slate-300"></i>';
            statusText.innerText = 'A aguardar lançamento...';
            statusText.className = "text-sm font-bold text-slate-400";
            
            btn.innerHTML = '<span>💾 Salvar Produção</span>';
            btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            btn.classList.remove('bg-amber-600', 'hover:bg-amber-700');
        }

    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        alert("Ocorreu um erro ao carregar os dados do dia.");
    }
}

function resetUI() {
    document.getElementById('display-meta-prod').innerHTML = '<i class="fas fa-spinner fa-spin text-lg text-slate-300"></i>';
    document.getElementById('display-meta-assert').innerHTML = '<i class="fas fa-spinner fa-spin text-lg text-slate-300"></i>';
    document.getElementById('input-qtd').value = '';
}

async function salvarProducao() {
    const dataSelecionada = document.getElementById('data-registo').value;
    const qtd = document.getElementById('input-qtd').value;
    const btn = document.getElementById('btn-salvar');

    if (!dataSelecionada || qtd === '') {
        alert("Por favor, preencha a quantidade.");
        return;
    }

    const originalBtnContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A processar...';
    btn.disabled = true;

    try {
        // Dados a salvar
        const payload = {
            usuario_id: currentUser.id,
            data: dataSelecionada,
            quantidade: parseInt(qtd),
            // Se tiveres colunas extras como 'erros', adiciona aqui
        };

        // Usamos upsert: Se já existir (user + data), atualiza. Se não, cria.
        // IMPORTANTE: A tabela 'producao' no Supabase deve ter uma constraint UNIQUE em (usuario_id, data)
        const { error } = await _supabase
            .from('producao')
            .upsert(payload, { onConflict: 'usuario_id, data' });

        if (error) throw error;

        // Feedback visual
        await carregarDadosDoDia(); // Recarrega para validar a meta visualmente
        alert("Produção gravada com sucesso!");

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar: " + error.message);
    } finally {
        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
    }
}