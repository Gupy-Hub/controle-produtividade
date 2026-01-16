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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando Regra de Jornada...';
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
            console.log("📂 [Importacao] Iniciando leitura (Regra: Jornada Estendida -10h)...");
            
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

        // Configuração da Jornada
        // Subtrair 10 horas garante que qualquer trabalho até as 07:00 AM (BRT) conte como o dia anterior
        const HORAS_SUBTRAIR = 10; 

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            if (!linha['Assistente']) continue;

            const endTimeRaw = linha['end_time']; 
            let dataJornada = null;
            let dataHoraCompleta = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                // 1. Cria Data a partir do UTC
                const dt = new Date(endTimeRaw);
                
                // 2. Aplica o "Recuo de Jornada" (-10 horas)
                // Ex: Sábado 04:00 UTC -> Sexta 18:00 (Cai na Sexta)
                dt.setHours(dt.getHours() - HORAS_SUBTRAIR);
                
                dataJornada = dt.toISOString().split('T')[0];
                dataHoraCompleta = endTimeRaw; // Mantém original para chave única
            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                // Fallback para datas simples (assume que já está certo ou aplica recuo simples)
                dataJornada = endTimeRaw.substring(0, 10);
                dataHoraCompleta = endTimeRaw; 
            } else {
                const agora = new Date();
                agora.setHours(agora.getHours() - HORAS_SUBTRAIR);
                dataJornada = agora.toISOString().split('T')[0];
                dataHoraCompleta = agora.toISOString(); 
            }

            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = parseInt(linha['nº Campos']) || 0;
            const nOk = parseInt(linha['Ok']) || 0;
            const nNok = parseInt(linha['Nok']) || 0;

            const objeto = {
                usuario_id: idAssistente,
                
                // DATA CALCULADA PELA JORNADA
                data_auditoria: dataJornada, 
                
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
        console.log(`✅ ${listaParaSalvar.length} registros processados (Jornada Ajustada).`);

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
                
                // Atualiza os registros existentes com a NOVA DATA CALCULADA
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
                    console.log(`🚀 Sincronizando Jornada: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}% Ajustado`;
                }
            }

            console.timeEnd("TempoEnvio");
            alert(`Sucesso! Datas ajustadas considerando turno da madrugada.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro durante a gravação: ${error.message}`);
        }
    }
};