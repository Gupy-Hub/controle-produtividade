window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

// IMPORTADOR EXCLUSIVO DE PRODUÇÃO (VOLUME)
Produtividade.Importacao.Validacao = {
    dadosProcessados: [],
    
    // Status que contam como produção válida
    statusValidos: ['OK', 'VALIDO', 'PROCESSADO', 'CONCLUIDO', 'SUCESSO', 'DONE'],
    
    init: function() {
        console.log("📥 Módulo de Importação de Produção Iniciado");
    },

    processar: function(input) {
        const file = input.files[0];
        if (!file) return;

        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo Arquivo de Produção...</span>`;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(h) {
                // Normaliza cabeçalho para aceitar variações
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: (results) => {
                this.analisarDados(results.data);
            }
        });
        
        input.value = '';
    },

    analisarDados: async function(linhas) {
        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');

        if (linhas.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert("O arquivo está vazio.");
        }

        // 1. DATA DA TELA (CRÍTICO para arquivos de resumo sem data)
        const elDataTela = document.getElementById('sel-data-dia');
        const dataTela = elDataTela ? elDataTela.value : null;

        if (!dataTela) {
            if(statusEl) statusEl.innerHTML = "";
            return alert("⚠️ Selecione uma DATA no filtro superior antes de importar arquivos de resumo.");
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600"><i class="fas fa-calculator"></i> Calculando Volumes...</span>`;
        await new Promise(r => setTimeout(r, 50));

        let contador = 0;

        for (let i = 0; i < linhas.length; i++) {
            const row = linhas[i];
            
            // 2. IDENTIFICAÇÃO DO USUÁRIO (Obrigatório ID)
            const idRaw = row['id_assistente'] || row['id'] || row['usuario_id'];
            if (!idRaw) continue; // Pula linhas de total ou sem ID

            const usuarioId = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (!usuarioId) continue;

            // 3. LÓGICA DE DATA
            // Se tiver 'end_time' (arquivo detalhado), usa ele. 
            // Se não, usa a data da tela (arquivo resumo).
            let dataFinal = dataTela; 
            
            if (row['end_time']) {
                dataFinal = row['end_time'].split('T')[0];
            } else if (row['data'] || row['data_referencia']) {
                const d = row['data'] || row['data_referencia'];
                if (d.includes('/')) { // DD/MM/AAAA
                    const p = d.split('/');
                    if (p.length === 3) dataFinal = `${p[2]}-${p[1]}-${p[0]}`;
                } else {
                    dataFinal = d;
                }
            }

            // 4. LÓGICA DE VOLUME
            let quantidade = 0;
            
            // Caso A: Arquivo de Resumo (tem coluna de total)
            if (row['documentos_validados'] || row['quantidade'] || row['qtd']) {
                quantidade = parseInt(row['documentos_validados'] || row['quantidade'] || row['qtd']) || 0;
            } 
            // Caso B: Arquivo Detalhado (conta 1 por linha)
            else {
                // Opcional: filtrar status se quiser ser estrito
                quantidade = 1;
            }

            // 5. STATUS
            // Se for resumo, é sempre OK. Se for detalhado, lê o status.
            let statusFinal = 'OK';
            if (row['status']) statusFinal = row['status'].toUpperCase();
            if (statusFinal === 'ERRO') statusFinal = 'NOK';
            if (statusFinal === 'SUCESSO') statusFinal = 'OK';

            // Outras métricas
            const fifo = parseInt(row['fifo'] || row['documentos_validados_fifo']) || 0;
            const gTotal = parseInt(row['gradual_total'] || row['gradual total'] || row['documentos_validados_gradual_total']) || 0;
            const gParcial = parseInt(row['gradual_parcial'] || row['gradual parcial'] || row['documentos_validados_gradual_parcial']) || 0;
            const perfilFc = parseInt(row['perfil_fc'] || row['perfil fc'] || row['documentos_validados_perfil_fc']) || 0;

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFinal,
                quantidade: quantidade,
                status: statusFinal,
                fifo: fifo,
                gradual_total: gTotal,
                gradual_parcial: gParcial,
                perfil_fc: perfilFc,
                fator: 1
            });
            
            contador++;
        }

        if(statusEl) statusEl.innerHTML = "";

        if (contador === 0) {
            return alert("Nenhum dado válido encontrado. Verifique se o arquivo tem a coluna 'id_assistente'.");
        }

        // Confirmação
        const msg = `Arquivo de Produção Processado:\n\n` +
                    `📅 Data Base: ${dataTela} (usada se o arquivo não tiver data)\n` +
                    `📊 Registros/Linhas: ${contador}\n\n` +
                    `Confirmar importação?`;

        if (confirm(msg)) {
            this.salvarNoBanco();
        }
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        const payload = this.dadosProcessados;
        const total = payload.length;
        const BATCH_SIZE = 1000;
        let enviados = 0;

        if(statusEl) statusEl.innerHTML = `<span class="text-orange-500 font-bold">Enviando produção...</span>`;

        // Opcional: Limpar produção anterior dessa data/usuário para evitar duplicidade de resumo
        // Para simplificar, vamos apenas inserir. Se quiser limpar, avise.

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = payload.slice(i, i + BATCH_SIZE);
            const { error } = await Sistema.supabase.from('producao').insert(chunk);
            
            if (error) {
                console.error(error);
                alert("Erro ao salvar: " + error.message);
                if(statusEl) statusEl.innerHTML = "";
                return;
            }
            
            enviados += chunk.length;
            if(statusEl) {
                const pct = Math.round((enviados/total)*100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-circle-notch fa-spin"></i> ${pct}%</span>`;
            }
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold">Sucesso!</span>`;
        setTimeout(() => { if(statusEl) statusEl.innerHTML = ""; }, 3000);
        
        alert("Produção importada com sucesso!");
        if (Produtividade.Geral) Produtividade.Geral.carregarTela();
    }
};