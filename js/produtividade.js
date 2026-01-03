document.addEventListener('DOMContentLoaded', init);

let currentUser = null;
let currentMetaProducao = 0;
let currentMetaAssertividade = 0;

async function init() {
    // 1. Verificar Login
    const session = localStorage.getItem('usuario'); // Corrigido para 'usuario' conforme seu layout.js
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(session);

    // 2. Definir data de hoje no input (se existir na página)
    // Nota: O HTML original 'produtividade.html' usa 'data-global', mas o seu JS antigo referia 'data-registo'.
    // Vou assumir que você tem um input com id="data-registo" na sua página onde este script roda.
    // Se estiver a usar o layout novo que usa DataGlobal, adapte conforme necessário.
    const dateInput = document.getElementById('data-registo');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.addEventListener('change', carregarDadosDoDia);
    }

    // 4. Carregar dados iniciais
    await carregarDadosDoDia();
}

async function carregarDadosDoDia() {
    const dateInput = document.getElementById('data-registo');
    // Se não houver input específico, tenta pegar a data global ou usa hoje
    const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

    if (!dataSelecionada) return;

    resetUI(); // Limpa os valores visuais enquanto carrega

    try {
        // --- A. Buscar Meta de Produção (Histórico) ---
        // Queremos a meta cuja data_inicio seja menor ou igual à data selecionada.
        const { data: metasProd, error: errMeta } = await _supabase
            .from('metas')
            .select('valor_meta')
            .eq('usuario_id', currentUser.id)
            .lte('data_inicio', dataSelecionada) 
            .order('data_inicio', { ascending: false })
            .limit(1);

        if (metasProd && metasProd.length > 0) {
            currentMetaProducao = metasProd[0].valor_meta;
            const elMeta = document.getElementById('display-meta-prod');
            if(elMeta) elMeta.innerText = currentMetaProducao;
        } else {
            currentMetaProducao = 0;
            const elMeta = document.getElementById('display-meta-prod');
            if(elMeta) elMeta.innerText = "N/D";
        }

        // --- B. Buscar Meta de Assertividade (Global) ---
        // [DESATIVADO TEMPORARIAMENTE CONFORME SOLICITADO]
        // Para não dar erro no sistema enquanto a tabela não existe ou não está configurada.
        
        currentMetaAssertividade = 0;
        const elAssert = document.getElementById('display-meta-assert');
        if(elAssert) elAssert.innerText = "--"; 

        /* CÓDIGO ORIGINAL (COMENTADO):
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
        */

        // --- C. Buscar Produção Já Lançada ---
        const { data: producao, error: errProd } = await _supabase
            .from('producao')
            .select('*')
            .eq('usuario_id', currentUser.id)
            .eq('data_referencia', dataSelecionada) // Atenção: O nome da coluna no banco costuma ser data_referencia ou data
            .maybeSingle();

        const statusIcon = document.getElementById('status-icon');
        const statusText = document.getElementById('status-text');
        const inputQtd = document.getElementById('input-qtd');
        const btn = document.getElementById('btn-salvar');

        if (producao) {
            // Se já existe produção
            if(inputQtd) inputQtd.value = producao.quantidade;
            
            // Verifica se bateu a meta
            if (statusIcon && statusText) {
                if (currentMetaProducao > 0 && producao.quantidade >= currentMetaProducao) {
                    statusIcon.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i>';
                    statusText.innerHTML = `<span class="text-emerald-600">Meta Atingida!</span>`;
                    statusText.className = "text-sm font-bold text-emerald-600";
                } else {
                    statusIcon.innerHTML = '<i class="fas fa-adjust text-amber-500"></i>';
                    statusText.innerHTML = 'Registo encontrado.<br>Pode editar abaixo.';
                    statusText.className = "text-sm font-bold text-amber-600";
                }
            }
            
            if(btn) {
                btn.innerHTML = '<span>✏️ Atualizar Registo</span>';
                btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                btn.classList.add('bg-amber-600', 'hover:bg-amber-700');
            }

        } else {
            // Nada lançado ainda
            if(inputQtd) inputQtd.value = '';
            
            if (statusIcon && statusText) {
                statusIcon.innerHTML = '<i class="fas fa-clock text-slate-300"></i>';
                statusText.innerText = 'A aguardar lançamento...';
                statusText.className = "text-sm font-bold text-slate-400";
            }
            
            if(btn) {
                btn.innerHTML = '<span>💾 Salvar Produção</span>';
                btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                btn.classList.remove('bg-amber-600', 'hover:bg-amber-700');
            }
        }

    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

function resetUI() {
    const elMeta = document.getElementById('display-meta-prod');
    if(elMeta) elMeta.innerHTML = '<i class="fas fa-spinner fa-spin text-lg text-slate-300"></i>';
    
    const elAssert = document.getElementById('display-meta-assert');
    if(elAssert) elAssert.innerHTML = '<i class="fas fa-spinner fa-spin text-lg text-slate-300"></i>';
    
    const inputQtd = document.getElementById('input-qtd');
    if(inputQtd) inputQtd.value = '';
}

async function salvarProducao() {
    const dateInput = document.getElementById('data-registo');
    const dataSelecionada = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
    const qtdInput = document.getElementById('input-qtd');
    const qtd = qtdInput ? qtdInput.value : '';
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
            data_referencia: dataSelecionada, // Usando data_referencia para manter padrão
            quantidade: parseInt(qtd),
            meta_diaria: currentMetaProducao // Opcional: Salvar qual era a meta no dia
        };

        // IMPORTANTE: A tabela 'producao' no Supabase deve ter uma constraint UNIQUE em (usuario_id, data_referencia)
        // Se a constraint se chamar 'producao_usuario_id_data_referencia_key', o onConflict funcionará.
        const { error } = await _supabase
            .from('producao')
            .upsert(payload, { onConflict: 'usuario_id, data_referencia' });

        if (error) throw error;

        // Feedback visual
        await carregarDadosDoDia(); 
        alert("Produção gravada com sucesso!");

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar: " + error.message);
    } finally {
        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
    }
}