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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recalculando Datas...';
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
            console.log("📂 [Importacao] Iniciando leitura (Regra: UTC -7h Fixa)...");
            
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

        // CONSTANTE MÁGICA: 7 Horas (3h Fuso + 4h Cutoff)
        // Isso alinha o início do dia fiscal (04:00 BRT) com o início do dia UTC (00:00)
        const MS_PER_HOUR = 60 * 60 * 1000;
        const OFFSET_TOTAL = 7 * MS_PER_HOUR;

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            if (!linha['Assistente']) continue;

            const endTimeRaw = linha['end_time']; 
            let dataFiscal = null;
            let dataHoraCompleta = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                // 1. Pega o instante exato do registro (em UTC)
                const dt = new Date(endTimeRaw);
                const time = dt.getTime(); // milissegundos

                // 2. Subtrai 7 horas fixas
                // Ex: Segunda 07:00 UTC (04:00 BRT) - 7h = Segunda 00:00 UTC -> Data: Segunda
                // Ex: Segunda 06:59 UTC (03:59 BRT) - 7h = Domingo 23:59 UTC -> Data: Domingo
                const dtFiscal = new Date(time - OFFSET_TOTAL);
                
                // 3. Extrai a data resultante
                dataFiscal = dtFiscal.toISOString().split('T')[0];
                dataHoraCompleta = endTimeRaw; 

            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                // Fallback (raro)
                dataFiscal = endTimeRaw.substring(0, 10);
                dataHoraCompleta = endTimeRaw; 
            } else {
                // Fallback para data de agora com o mesmo ajuste
                const now = new Date();
                const dtFiscalNow = new Date(now.getTime() - OFFSET_TOTAL);
                dataFiscal = dtFiscalNow.toISOString().split('T')[0];
                dataHoraCompleta = now.toISOString(); 
            }

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                usuario_id: idAssistente,
                
                // DATA CORRETA
                data_auditoria: dataFiscal, 
                
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
        console.log(`✅ ${listaParaSalvar.length} registros processados (Lógica UTC-7h).`);

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
                
                // Upsert para corrigir as datas dos registros existentes
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
                    console.log(`🚀 Corrigindo Datas: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Corrigido`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Sucesso! Domingo deve ter sumido e voltado para Segunda.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro durante a gravação: ${error.message}`);
        }
    }
};