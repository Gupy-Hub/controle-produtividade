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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
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
            console.log("📂 [Importacao] Iniciando leitura (Modo: Upsert Anti-Duplicidade)...");
            
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
        
        // Array simples, pois a deduplicação será feita no Banco de Dados
        const listaParaSalvar = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            if (!linha['Assistente']) continue;

            // --- TRATAMENTO DE DATAS ---
            const endTimeRaw = linha['end_time']; // Ex: "2025-12-02T12:17:04.332Z"
            let dataApenas = null;
            let dataHoraCompleta = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                dataApenas = endTimeRaw.split('T')[0]; // "2025-12-02" (Para Relatórios)
                dataHoraCompleta = endTimeRaw;         // Completo (Para Unicidade)
            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                dataApenas = endTimeRaw.substring(0, 10);
                dataHoraCompleta = endTimeRaw; // Assume que é único
            } else {
                // Fallback: Data de agora
                const agora = new Date().toISOString();
                dataApenas = agora.split('T')[0];
                dataHoraCompleta = agora; 
            }

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                // --- CHAVES ---
                usuario_id: idAssistente,
                
                // DATA DE AUDITORIA: Só a Data (Conforme sua regra de negócio)
                data_auditoria: dataApenas, 
                
                // DATA REFERENCIA: Carimbo de Tempo Exato (Segredo para não duplicar o arquivo)
                data_referencia: dataHoraCompleta, 
                
                created_at: new Date().toISOString(),

                // --- DADOS ---
                company_id: linha['Company_id'], 
                empresa_id: companyId,           
                empresa: linha['Empresa'],
                empresa_nome: linha['Empresa'],
                assistente: linha['Assistente'],
                nome_assistente: linha['Assistente'],
                auditora: linha['Auditora'],
                nome_auditora_raw: linha['Auditora'],
                doc_name: linha['doc_name'],
                nome_documento: linha['doc_name'],
                status: linha['STATUS'], 
                obs: linha['Apontamentos/obs'],
                observacao: linha['Apontamentos/obs'],
                porcentagem: linha['% Assert'], 
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
        console.log(`✅ ${listaParaSalvar.length} registros processados.`);

        if (listaParaSalvar.length > 0) {
            await this.enviarParaSupabase(listaParaSalvar);
        } else {
            alert("Nenhum dado válido encontrado.");
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
                
                // --- UPSERT COM IGNORE DUPLICATES ---
                // onConflict usa a constraint que criamos no SQL: unique_historico_fiel
                // Se a linha já existir (mesmo assistente, hora exata, doc e status), ignora.
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'assistente, data_referencia, doc_name, status',
                        ignoreDuplicates: true 
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Sincronizando: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Processado`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Processo Finalizado! Arquivo sincronizado com segurança.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro durante a gravação: ${error.message}`);
        }
    }
};