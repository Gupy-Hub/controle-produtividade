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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo Texto Puro...';
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
            console.log("📂 [Importacao] Iniciando leitura (Modo: TEXTO ESTRITO - Ignora Horas)...");
            
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

        // Variável para debug no console (mostrará as 3 primeiras datas encontradas)
        let debugCount = 0;

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            if (!linha['Assistente']) continue;

            const endTimeRaw = linha['end_time']; 
            let dataTextoPuro = null;

            // --- LÓGICA DE CORTE DE STRING (ZERO MATEMÁTICA) ---
            if (endTimeRaw && endTimeRaw.includes('T')) {
                // Pega tudo que está ANTES do T.
                // Ex: "2025-12-07T02:00:00Z" -> vira -> "2025-12-07"
                dataTextoPuro = endTimeRaw.split('T')[0];
            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                dataTextoPuro = endTimeRaw.substring(0, 10);
            } else {
                // Se estiver vazio, usa hoje
                dataTextoPuro = new Date().toISOString().split('T')[0];
            }

            // DEBUG: Mostra no console o que ele está lendo das 5 primeiras linhas
            if (debugCount < 5) {
                console.log(`🔍 Linha ${i+1}: Original="${endTimeRaw}" -> Gravando="${dataTextoPuro}"`);
                debugCount++;
            }

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                usuario_id: idAssistente,
                
                // DATA PURA
                data_auditoria: dataTextoPuro, 
                
                // Usamos o RAW completo apenas para garantir que não duplicamos a MESMA linha do Excel
                data_referencia: endTimeRaw || new Date().toISOString(), 
                
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
                    console.log(`🚀 Gravando: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Salvo`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Importação Concluída! Verifique o console (F12) para ver as datas originais.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro durante a gravação: ${error.message}`);
        }
    }
};