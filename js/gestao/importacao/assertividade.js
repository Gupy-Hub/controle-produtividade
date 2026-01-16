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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando Histórico...';
                btn.disabled = true;
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            }

            // Timeout para garantir que a UI mostre o "spinner" antes de travar no processamento
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
            console.log("📂 [Importacao] Iniciando leitura (Fonte Data: end_time)...");
            
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
                    alert("Erro crítico ao ler o arquivo CSV.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        console.time("TempoTratamento");
        
        // Array simples: Aceita tudo, sem deduplicar (Histórico Completo)
        const listaParaSalvar = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Validação mínima: linha deve ter assistente para ser válida
            if (!linha['Assistente']) continue;

            // --- REGRA DE DATA (end_time) ---
            // Formato esperado: "2025-12-02T12:17:04.332Z"
            const endTimeRaw = linha['end_time']; 
            let dataFmt = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                // Pega a parte antes do T (Data YYYY-MM-DD)
                dataFmt = endTimeRaw.split('T')[0];
            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                // Fallback (apenas os 10 primeiros caracteres)
                dataFmt = endTimeRaw.substring(0, 10);
            } else {
                // Fallback de segurança: Data de hoje
                dataFmt = new Date().toISOString().split('T')[0];
            }

            // Conversões numéricas para evitar erros no banco
            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                // --- CHAVES E DATAS ---
                usuario_id: idAssistente,
                
                // Data Oficial: Vinda do end_time
                data_auditoria: dataFmt, 
                data_referencia: dataFmt, 
                
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

                // Status pode repetir (REV -> NOK -> OK)
                status: linha['STATUS'], 
                
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
            alert("Nenhum dado válido encontrado nas colunas.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            // Lote grande para velocidade
            const BATCH_SIZE = 1000; 
            let totalInserido = 0;
            const total = dados.length;
            
            console.time("TempoEnvio");
            const statusDiv = document.getElementById('status-importacao');
            
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // INSERT PURO: Grava tudo como novo registro (Histórico)
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .insert(lote);

                if (error) throw error;
                
                totalInserido += lote.length;
                
                // Atualiza progresso visual a cada 5k registros
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Enviando: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Salvo`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Processo Finalizado! ${totalInserido} registros importados com sucesso.`);
            
            // Recarrega a tabela se estiver na tela de gestão
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro durante a gravação: ${error.message}`);
        }
    }
};