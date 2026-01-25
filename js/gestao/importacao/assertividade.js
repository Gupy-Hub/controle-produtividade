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

            // Pequeno delay para a UI atualizar antes de travar a thread na leitura
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
            console.log("📂 [Importacao] Iniciando leitura focada em end_time.");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas brutas encontradas: ${results.data.length}`);
                    await this.tratarEEnviar(results.data);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro CSV:", error);
                    alert("Erro crítico ao ler o arquivo CSV. Verifique a codificação.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        console.time("TempoTratamento");
        const listaParaSalvar = [];

        // Funções auxiliares de limpeza
        const tratarInt = (val) => {
            if (val === "" || val === null || val === undefined || (typeof val === 'string' && val.trim() === "")) return null;
            const parsed = parseInt(val);
            return isNaN(parsed) ? null : parsed;
        };

        const tratarString = (val) => {
             if (val === "" || val === null || val === undefined || (typeof val === 'string' && val.trim() === "")) return null;
             return String(val).trim();
        };

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // --- VALIDAÇÃO CRÍTICA DO END_TIME ---
            // Se não houver end_time, o registro não tem validade temporal para auditoria.
            const endTimeRaw = tratarString(linha['end_time']);
            if (!endTimeRaw) continue;

            // Extração precisa da Data de Referência baseada no end_time
            // Formato esperado: ISO (ex: 2025-09-30T23:25:44.646Z) ou YYYY-MM-DD...
            let dataLiteral = null;

            try {
                // Tenta extrair a data ISO (YYYY-MM-DD)
                if (endTimeRaw.includes('T')) {
                    dataLiteral = endTimeRaw.split('T')[0];
                } else if (endTimeRaw.length >= 10) {
                    // Fallback para formatos simples se necessário, mas prioriza a string exata
                    dataLiteral = endTimeRaw.substring(0, 10);
                }
                
                // Validação extra de data válida
                const testeData = new Date(dataLiteral);
                if (isNaN(testeData.getTime())) {
                    console.warn(`[Ignorado] Data inválida na linha ${i}: ${endTimeRaw}`);
                    continue; 
                }
            } catch (e) {
                continue; // Pula se der erro no parse
            }

            // Mapeamento do Objeto
            const objeto = {
                // Chaves de Identidade (Unique Constraint Candidate)
                id_ppc: tratarInt(linha['ID PPC']),
                end_time_raw: endTimeRaw, // Ponto de conferência exato
                doc_name: tratarString(linha['doc_name']),
                schema_id: tratarInt(linha['Schema_id']),

                // Dados Temporais
                data_referencia: dataLiteral, // Usado para filtros de dashboard
                data_auditoria: tratarString(linha['Data da Auditoria ']),

                // Relacionamentos e Metadados
                usuario_id: tratarInt(linha['id_assistente']),
                company_id: tratarInt(linha['Company_id']),
                empresa_nome: tratarString(linha['Empresa']),
                assistente_nome: tratarString(linha['Assistente']),
                auditora_nome: tratarString(linha['Auditora']),
                status: tratarString(linha['STATUS']),
                nome_ppc: tratarString(linha['Nome da PPC']),
                observacao: tratarString(linha['Apontamentos/obs']),
                tipo_documento: tratarString(linha['DOCUMENTO']),
                fila: tratarString(linha['Fila']),
                revalidacao: tratarString(linha['Revalidação']),
                
                // Métricas
                qtd_campos: tratarInt(linha['nº Campos']),
                qtd_ok: tratarInt(linha['Ok']),
                qtd_nok: tratarInt(linha['Nok']),
                qtd_docs_validados: tratarInt(linha['Quantidade_documentos_validados']),
                porcentagem_assertividade: tratarString(linha['% Assert'])
            };

            listaParaSalvar.push(objeto);
        }

        console.timeEnd("TempoTratamento");
        
        if (listaParaSalvar.length > 0) {
            await this.enviarParaSupabase(listaParaSalvar);
        } else {
            alert("Nenhum dado válido encontrado. Verifique se a coluna 'end_time' está presente e preenchida.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            const BATCH_SIZE = 1000; 
            let totalInserido = 0;
            const total = dados.length;
            const statusDiv = document.getElementById('status-importacao');
            
            console.log(`📡 Preparando para enviar ${total} registros para o Supabase...`);

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // UPSERT baseado na chave composta definida no banco.
                // Geralmente: id_ppc + end_time_raw + schema_id + doc_name
                // Isso garante que se importarmos o mesmo arquivo 2x, ele atualiza/ignora em vez de duplicar.
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'id_ppc,end_time_raw,schema_id,doc_name',
                        ignoreDuplicates: false // False = Atualiza se existir (útil se mudou status)
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                
                // Feedback visual
                if (statusDiv) {
                    const pct = Math.round((totalInserido / total) * 100);
                    statusDiv.innerText = `${pct}%`;
                    statusDiv.style.width = `${pct}%`;
                }
                
                if (totalInserido % 5000 === 0) {
                     console.log(`🚀 Progresso: ${totalInserido}/${total}`);
                }
            }

            alert(`Importação Concluída!\n${totalInserido} registros processados com sucesso.`);
            
            // Atualiza a grid se estiver na tela de gestão
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Falha na importação: ${error.message || error.details}`);
        } finally {
            // Limpa status
            const statusDiv = document.getElementById('status-importacao');
            if(statusDiv) {
                statusDiv.innerText = '';
                statusDiv.style.width = '0%';
            }
        }
    }
};