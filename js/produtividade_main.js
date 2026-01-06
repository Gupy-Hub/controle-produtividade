let _supabase = null;

// Objeto Main principal
const MA_Main = {};

async function inicializar() {
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window._supabase = _supabase;
        console.log("Supabase Conectado.");
    } else {
        console.error("Supabase SDK não encontrado.");
        alert("Erro de configuração: Supabase não detectado.");
        return;
    }

    await Sistema.Dados.inicializar();
    
    // Configura o input de data global
    Sistema.Datas.criarInputInteligente('global-date', 'produtividade_data_ref', () => {
        atualizarDataGlobal(document.getElementById('global-date').value);
    });

    // Garante data inicial se vazio
    const dateInput = document.getElementById('global-date');
    if (!dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Carrega a aba inicial
    mudarAba('geral');
}

function atualizarDataGlobal(novaData) {
    if (!novaData) return;
    localStorage.setItem('produtividade_data_ref', novaData);

    // Recarrega apenas a aba visível para economizar recursos
    if (!document.getElementById('tab-geral').classList.contains('hidden')) { Geral.carregarTela(); }
    if (!document.getElementById('tab-consolidado').classList.contains('hidden')) { Cons.carregar(); }
    if (!document.getElementById('tab-performance').classList.contains('hidden')) { Perf.carregarRanking(); }
    if (!document.getElementById('tab-matriz').classList.contains('hidden')) { Matriz.carregar(); }
}

// --- LÓGICA DE IMPORTAÇÃO (Refatorada) ---
async function importarExcel(input) {
    if (!input.files || input.files.length === 0) return;

    try {
        // 1. Ler o arquivo usando o módulo Importacao
        const resultadoLeitura = await Importacao.lerArquivo(input);
        
        let dataFinal = resultadoLeitura.dataSugestionada;
        
        // 2. Confirmação da Data com o Usuário
        if (dataFinal) {
            const dataFormatada = dataFinal.split('-').reverse().join('/');
            if (!confirm(`O arquivo parece ser do dia ${dataFormatada}. Confirmar importação para esta data?`)) {
                // Se o usuário negar, pergunta se quer usar a data selecionada no painel
                const dataPainel = document.getElementById('global-date').value;
                if(confirm(`Deseja usar a data selecionada no painel (${dataPainel.split('-').reverse().join('/')})?`)) {
                    dataFinal = dataPainel;
                } else {
                    input.value = ""; return; // Cancela tudo
                }
            }
        } else {
            // Se não detectou data no nome, usa a do painel
            dataFinal = document.getElementById('global-date').value;
            const dataFormatada = dataFinal.split('-').reverse().join('/');
            if(!confirm(`Data não detectada no nome do arquivo. Importar para ${dataFormatada}?`)) {
                input.value = ""; return;
            }
        }

        // 3. Atualiza o input visualmente para feedback
        const inputDate = document.getElementById('global-date');
        inputDate.value = dataFinal;
        atualizarDataGlobal(dataFinal); // Já troca o contexto do painel

        // 4. Processa os dados
        const resultadoProcessamento = await Importacao.processar(resultadoLeitura.dados, dataFinal);

        // 5. Feedback Final
        let msg = `✅ Sucesso! ${resultadoProcessamento.qtdImportada} registros atualizados.`;
        
        if (resultadoProcessamento.nomesNaoEncontrados.length > 0) {
            msg += `\n\n⚠️ Atenção: ${resultadoProcessamento.nomesNaoEncontrados.length} nomes não foram encontrados no cadastro:\n`;
            // Mostra apenas os 5 primeiros para não poluir o alert
            msg += resultadoProcessamento.nomesNaoEncontrados.slice(0, 5).join(', ');
            if (resultadoProcessamento.nomesNaoEncontrados.length > 5) msg += '... e outros.';
        }

        alert(msg);
        
        // Recarrega a tela atual
        if (!document.getElementById('tab-geral').classList.contains('hidden')) { 
            Geral.carregarTela(); 
        }

    } catch (erro) {
        console.error("Falha na importação:", erro);
        alert("❌ Erro na importação: " + erro.message);
    } finally {
        input.value = ""; // Limpa o input para permitir selecionar o mesmo arquivo novamente
    }
}

// --- CONTROLE DE ABAS (UI) ---
window.mudarAba = function(aba) {
    // Esconde todas as seções
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Mostra a seção desejada
    const tabEl = document.getElementById(`tab-${aba}`);
    if (tabEl) tabEl.classList.remove('hidden');
    
    // Ativa o botão
    const btnEl = document.getElementById(`btn-${aba}`);
    if (btnEl) btnEl.classList.add('active');

    // Gerencia controles do topo (filtros específicos de cada aba)
    const ctrls = ['ctrl-geral', 'ctrl-consolidado', 'ctrl-performance'];
    ctrls.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    if (aba === 'geral') {
        const c = document.getElementById('ctrl-geral');
        if(c) c.classList.remove('hidden');
        Geral.carregarTela();
    } 
    else if (aba === 'consolidado') {
        const c = document.getElementById('ctrl-consolidado');
        if(c) c.classList.remove('hidden');
        Cons.init();
    } 
    else if (aba === 'performance') {
        const c = document.getElementById('ctrl-performance');
        if(c) c.classList.remove('hidden');
        Perf.init();
    } 
    else if (aba === 'matriz') {
        Matriz.init();
    }
};

document.addEventListener('DOMContentLoaded', inicializar);