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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando Lógica Híbrida...';
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
            console.log("📂 [Importacao] Iniciando (Regra: UTC-3 com Proteção de Domingo)...");
            
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
        const listaParaSalvar = [];

        // 3 Horas em milissegundos
        const OFFSET_BRASIL = 3 * 60 * 60 * 1000; 

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            if (!linha['Assistente']) continue;

            const endTimeRaw = linha['end_time']; 
            let dataFinal = null;
            let dataHoraCompleta = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                // 1. Data Original UTC
                const dtUTC = new Date(endTimeRaw);
                const msUTC = dtUTC.getTime();

                // 2. Aplica UTC-3 (Brasil)
                // Ex: Sábado 01:00 UTC vira Sexta 22:00 (Sexta é dia 5 na semana JS? Depende da ref)
                const dtBrasil = new Date(msUTC - OFFSET_BRASIL);
                
                // 3. Verificação de Dia da Semana (0 = Domingo, 6 = Sábado)
                // getUTCDay() aqui funciona porque criamos a data subtraindo o offset manualmente
                const diaSemanaBrasil = dtBrasil.getUTCDay();

                // LÓGICA DE PROTEÇÃO DE DOMINGO
                if (diaSemanaBrasil === 0) { 
                    // Se caiu no Domingo (era Segunda de madrugada), volta para Segunda
                    // Adiciona 1 dia (24h)
                    dtBrasil.setTime(dtBrasil.getTime() + (24 * 60 * 60 * 1000));
                }

                dataFinal = dtBrasil.toISOString().split('T')[0];
                dataHoraCompleta = endTimeRaw; 

            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                // Fallback
                dataFinal = endTimeRaw.substring(0, 10);
                dataHoraCompleta = endTimeRaw; 
            } else {
                const now = new Date();
                dataFinal = now.toISOString().split('T')[0];
                dataHoraCompleta = now.toISOString(); 
            }

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                usuario_id: idAssistente,
                data_auditoria: dataFinal, 
                data_referencia: dataHoraCompleta, 
                created_at: new Date().toISOString(),
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
                
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'assistente,data_referencia,doc_name,status',
                        ignoreDuplicates: false 
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Sincronizando: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Salvo`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Sucesso! Sábados viraram Sextas. Segundas continuam Segundas.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro durante a gravação: ${error.message}`);
        }
    }
};