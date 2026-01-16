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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando TUDO...';
                btn.disabled = true;
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            }

            // Pequeno delay para a UI atualizar
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
            console.log("📂 [Importacao] Lendo arquivo (Regra: end_time somente data)...");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas totais: ${results.data.length}`);
                    await this.tratarEEnviar(results.data);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro CSV:", error);
                    alert("Erro crítico na leitura do arquivo.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        console.time("TempoTratamento");
        
        const listaParaSalvar = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Pula linhas vazias ou cabeçalhos repetidos
            if (!linha['Assistente']) continue;

            // --- REGRA DE DATA (end_time) ---
            // Formato esperado no CSV: "2025-12-02T12:17:04.332Z"
            const endTimeRaw = linha['end_time']; 
            let dataFmt = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                // Pega tudo que vem antes do 'T' (ex: "2025-12-02")
                dataFmt = endTimeRaw.split('T')[0];
            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                // Fallback simples se não tiver T
                dataFmt = endTimeRaw.substring(0, 10);
            } else {
                // Se o end_time estiver vazio, usa a data de hoje (segurança)
                dataFmt = new Date().toISOString().split('T')[0];
            }

            // Conversões numéricas
            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                // --- CHAVES E DATAS ---
                usuario_id: idAssistente,
                
                // Grava APENAS A DATA extraída do end_time
                data_auditoria: dataFmt, 
                data_referencia: dataFmt, 
                
                // Data de criação do registro no sistema (hoje/agora)
                created_at: new Date().toISOString(),

                // --- IDENTIFICAÇÃO ---
                company_id: linha['Company_id'], 
                empresa_id: companyId,           
                
                empresa: linha['Empresa'],
                empresa_nome: linha['Empresa'],

                assistente: linha['Assistente'],
                nome_assistente: linha['Assistente'],

                auditora: linha['Auditora'],
                nome_auditora_raw: linha['Auditora'],

                // --- CONTEÚDO ---
                doc_name: linha['doc_name'],
                nome_documento: linha['doc_name'],

                status: linha['STATUS'], // Salva o status histórico (REV, NOK, OK...)
                
                obs: linha['Apontamentos/obs'],
                observacao: linha['Apontamentos/obs'],

                porcentagem: linha['% Assert'], 

                // --- MÉTRICAS ---
                campos: nCampos,
                num_campos: nCampos,
                ok: nOk,
                qtd_ok: nOk,
                nok: nNok,
                qtd_nok: nNok
            };

            listaParaSalvar.push(objeto);
        }

        console.timeEnd("TempoTratamento");
        console.log(`✅ ${listaParaSalvar.length} registros prontos para inserção.`);

        if (listaParaSalvar.length > 0) {
            await this.enviarParaSupabase(listaParaSalvar);
        } else {
            alert("Nenhum dado encontrado. Verifique a coluna 'end_time' e 'Assistente'.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            // Lote de 1000 para performance
            const BATCH_SIZE = 1000; 
            let totalInserido = 0;
            const total = dados.length;
            
            console.time("TempoEnvio");
            const statusDiv = document.getElementById('status-importacao');
            
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // INSERT PURO (Permite duplicatas de documentos se for histórico)
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .insert(lote);

                if (error) throw error;
                
                totalInserido += lote.length;
                
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Enviando: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Concluído`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Sucesso! ${totalInserido} registros históricos importados com Data do end_time.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro na gravação: ${error.message}`);
        }
    }
};