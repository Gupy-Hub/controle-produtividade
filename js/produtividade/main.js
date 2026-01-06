const Produtividade = {
    supabase: null,

    init: async function() {
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            Produtividade.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = Produtividade.supabase; // Compatibilidade global
        } else {
            return alert("Erro: Supabase não configurado.");
        }

        // Sistema de Dados compartilhado (se houver)
        if(window.Sistema && Sistema.Dados) await Sistema.Dados.inicializar();

        const dateInput = document.getElementById('global-date');
        const storedDate = localStorage.getItem('produtividade_data_ref');
        
        if (storedDate) {
            dateInput.value = storedDate;
        } else {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        Produtividade.mudarAba('geral');
    },

    atualizarDataGlobal: function(novaData) {
        if (!novaData) return;
        localStorage.setItem('produtividade_data_ref', novaData);

        // Recarrega aba ativa
        if (!document.getElementById('tab-geral').classList.contains('hidden')) Produtividade.Geral.carregarTela();
        else if (!document.getElementById('tab-consolidado').classList.contains('hidden')) Produtividade.Consolidado.carregar();
        else if (!document.getElementById('tab-performance').classList.contains('hidden')) Produtividade.Performance.carregarRanking();
        else if (!document.getElementById('tab-matriz').classList.contains('hidden')) Produtividade.Matriz.carregar();
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        document.getElementById(`tab-${aba}`).classList.remove('hidden');
        document.getElementById(`btn-${aba}`).classList.add('active');

        // Controles Topo
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

    importarExcel: async function(input) {
        if (!input.files || input.files.length === 0) return;

        try {
            // Usa o Importacao.js global
            const resultadoLeitura = await Importacao.lerArquivo(input);
            let dataFinal = resultadoLeitura.dataSugestionada;
            
            if (dataFinal) {
                const dataFmt = dataFinal.split('-').reverse().join('/');
                if (!confirm(`Arquivo detectado para ${dataFmt}. Confirmar?`)) {
                    dataFinal = document.getElementById('global-date').value;
                }
            } else {
                dataFinal = document.getElementById('global-date').value;
                if(!confirm("Data não detectada. Usar data selecionada no painel?")) {
                    input.value = ""; return;
                }
            }

            // Atualiza data visualmente e no processamento
            document.getElementById('global-date').value = dataFinal;
            Produtividade.atualizarDataGlobal(dataFinal);

            // Importacao.processar agora lida com a lógica de insert/update
            const resultado = await Importacao.processar(resultadoLeitura.dados, dataFinal);

            let msg = `✅ ${resultado.qtdImportada} registros importados.`;
            if (resultado.nomesNaoEncontrados.length > 0) {
                msg += `\n⚠️ Nomes não encontrados: ${resultado.nomesNaoEncontrados.length}`;
            }
            alert(msg);
            
            // Recarrega
            Produtividade.Geral.carregarTela();

        } catch (erro) {
            alert("❌ Erro: " + erro.message);
        } finally {
            input.value = "";
        }
    }
};

document.addEventListener('DOMContentLoaded', Produtividade.init);