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
            console.log("📂 [Importacao Total] Iniciando leitura...");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas no arquivo: ${results.data.length}`);
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
        
        // MUDANÇA: Array simples em vez de Map (aceita duplicatas/histórico)
        const listaParaSalvar = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Validação mínima apenas para não salvar linha em branco
            if (!linha['Assistente']) continue;

            // Tratamento de Data Rápido
            const dataRaw = linha['Data da Auditoria '] || linha['Data da Auditoria'] || ''; 
            let dataFmt;
            
            if (dataRaw && dataRaw.indexOf('/') > -1) {
                const partes = dataRaw.trim().split('/');
                dataFmt = partes[2] + '-' + partes[1] + '-' + partes[0];
            } else {
                dataFmt = new Date().toISOString().substring(0, 10);
            }

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                // CHAVES
                usuario_id: idAssistente,
                data_auditoria: dataFmt,
                data_referencia: dataFmt, 
                created_at: new Date().toISOString(),

                // IDENTIFICAÇÃO 
                company_id: linha['Company_id'], 
                empresa_id: companyId,           
                
                empresa: linha['Empresa'],
                empresa_nome: linha['Empresa'],

                assistente: linha['Assistente'],
                nome_assistente: linha['Assistente'],

                auditora: linha['Auditora'],
                nome_auditora_raw: linha['Auditora'],

                // CONTEÚDO
                doc_name: linha['doc_name'],
                nome_documento: linha['doc_name'],

                status: linha['STATUS'], // Aqui virá REV, NOK, OK repetido se houver histórico
                obs: linha['Apontamentos/obs'],
                observacao: linha['Apontamentos/obs'],

                porcentagem: linha['% Assert'], 

                // MÉTRICAS
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
            alert("Nenhum dado encontrado.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            const BATCH_SIZE = 1000; 
            let totalInserido = 0;
            const total = dados.length;
            
            console.time("TempoEnvio");
            const statusDiv = document.getElementById('status-importacao');
            
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // MUDANÇA: .insert() puro. Sem onConflict. Sem upsert.
                // Isso garante que tudo seja salvo como novo registro.
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .insert(lote);

                if (error) throw error;
                
                totalInserido += lote.length;
                
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Inserindo: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Salvo`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Importação COMPLETA! ${totalInserido} linhas inseridas no banco.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro no envio: ${error.message}`);
        }
    }
};