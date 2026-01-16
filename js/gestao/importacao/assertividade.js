window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = '';
            
            if (btn) {
                originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo e Processando...';
                btn.disabled = true;
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            }

            // Timeout para dar tempo da UI atualizar antes de travar no processamento
            setTimeout(() => {
                this.lerCSV(file).finally(() => {
                    input.value = ''; 
                    if (btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        btn.classList.remove('cursor-not-allowed', 'opacity-75');
                    }
                });
            }, 100);
        }
    },

    lerCSV: function(file) {
        return new Promise((resolve) => {
            console.time("TempoLeitura");
            console.log("📂 [Importacao] Iniciando leitura otimizada...");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas brutas: ${results.data.length}`);
                    await this.tratarEEnviar(results.data);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro CSV:", error);
                    alert("Erro na leitura do arquivo.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        console.time("TempoTratamento");
        const mapaDuplicatas = new Map();

        // Loop Otimizado (sem logs internos)
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            if (!linha['Assistente']) continue;

            // Tratamento de Data Rápido
            // O CSV tem um espaço no final: "Data da Auditoria "
            const dataRaw = linha['Data da Auditoria '] || linha['Data da Auditoria'] || ''; 
            let dataFmt;
            
            // Regex simples é mais rápido que splits múltiplos para validação
            if (dataRaw && dataRaw.indexOf('/') > -1) {
                const partes = dataRaw.trim().split('/');
                // YYYY-MM-DD
                dataFmt = partes[2] + '-' + partes[1] + '-' + partes[0];
            } else {
                dataFmt = new Date().toISOString().substring(0, 10);
            }

            // Conversões numéricas seguras
            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            // Chave Única para Deduplicação (Mesma do Banco)
            const chaveUnica = linha['Assistente'] + '|' + dataFmt + '|' + linha['Empresa'] + '|' + linha['doc_name'];

            const objeto = {
                // CHAVES
                usuario_id: idAssistente,
                data_auditoria: dataFmt,
                data_referencia: dataFmt, // Redundância útil para filtros
                created_at: new Date().toISOString(),

                // IDENTIFICAÇÃO (Espelhamento para compatibilidade)
                company_id: linha['Company_id'], // Texto original
                empresa_id: companyId,           // Numérico
                
                empresa: linha['Empresa'],
                empresa_nome: linha['Empresa'],

                assistente: linha['Assistente'],
                nome_assistente: linha['Assistente'],

                auditora: linha['Auditora'],
                nome_auditora_raw: linha['Auditora'],

                // CONTEÚDO
                doc_name: linha['doc_name'],
                nome_documento: linha['doc_name'],

                status: linha['STATUS'],
                obs: linha['Apontamentos/obs'],
                observacao: linha['Apontamentos/obs'],

                porcentagem: linha['% Assert'], // Mantém texto "100,00%"

                // MÉTRICAS
                campos: nCampos,
                num_campos: nCampos,
                ok: nOk,
                qtd_ok: nOk,
                nok: nNok,
                qtd_nok: nNok
            };

            // Sobrescreve: mantém sempre a última versão da planilha (estado final)
            mapaDuplicatas.set(chaveUnica, objeto);
        }

        const listaFinal = Array.from(mapaDuplicatas.values());
        console.timeEnd("TempoTratamento");
        
        console.log(`✅ ${listaFinal.length} registros únicos processados.`);

        if (listaFinal.length > 0) {
            await this.enviarParaSupabase(listaFinal);
        } else {
            alert("Nenhum dado válido encontrado.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            // AUMENTADO PARA 1000 (10x mais rápido)
            const BATCH_SIZE = 1000; 
            let totalInserido = 0;
            const total = dados.length;
            
            console.time("TempoEnvio");
            const statusDiv = document.getElementById('status-importacao'); // Se existir na tela
            
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'assistente, data_auditoria, empresa, doc_name',
                        ignoreDuplicates: false 
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                
                // Log de progresso a cada 5.000 registros para não sujar o console
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Progresso: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Enviado`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Processo concluído! ${totalInserido} linhas sincronizadas.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro no envio: ${error.message}`);
        }
    }
};