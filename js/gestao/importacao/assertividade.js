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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo CSV Completo...';
                btn.disabled = true;
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            }

            // Pequeno delay para a UI atualizar antes de travar no processamento
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
            console.log("📂 [Importacao] Iniciando leitura com ISO-8859-1...");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", // Ajustado para ler acentos do Excel (Brasil)
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas no arquivo: ${results.data.length}`);
                    await this.tratarEEnviar(results.data);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro CSV:", error);
                    alert("Erro crítico ao ler o arquivo CSV. Verifique o formato.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        console.time("TempoTratamento");
        const listaParaSalvar = [];

        // Funções auxiliares para limpeza
        const limpar = (val) => val ? String(val).trim() : null;
        const numero = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            return parseFloat(String(val).replace('%', '').replace(',', '.'));
        };

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Validação básica: precisa ter nome de assistente ou documento
            if (!linha['Assistente'] && !linha['doc_name']) continue;

            const endTimeRaw = linha['end_time']; 
            let dataLiteral = null;

            // --- TRATAMENTO DE DATA ---
            // Prioriza a "Data da Auditoria" se existir, senão usa o end_time
            if (linha['Data da Auditoria ']) { // Nota: Espaço no final conforme CSV original
                const partes = linha['Data da Auditoria '].split('/');
                if (partes.length === 3) {
                    dataLiteral = `${partes[2]}-${partes[1]}-${partes[0]}`; // YYYY-MM-DD
                }
            } 
            
            if (!dataLiteral && endTimeRaw) {
                if (endTimeRaw.includes('T')) {
                    dataLiteral = endTimeRaw.split('T')[0];
                } else {
                    dataLiteral = endTimeRaw.substring(0, 10);
                }
            }

            // Dados Numéricos
            const idAssistente = parseInt(linha['id_assistente']) || null;
            const companyId = parseInt(linha['Company_id']) || null;
            const nCampos = numero(linha['nº Campos']);
            const nOk = numero(linha['Ok']);
            const nNok = numero(linha['Nok']);
            const pct = numero(linha['% Assert']);

            // --- OBJETO COMPLETO (Mapeando todas as colunas) ---
            const objeto = {
                // IDs e Chaves
                usuario_id: idAssistente, // Tenta vincular pelo ID da planilha
                company_id: linha['Company_id'], 
                empresa_id: companyId,           
                
                // Datas
                data_auditoria: dataLiteral, 
                data_referencia: endTimeRaw || new Date().toISOString(), 
                end_time: endTimeRaw ? new Date(endTimeRaw) : null, // Nova coluna timestamp
                created_at: new Date().toISOString(),

                // Dados Descritivos
                empresa: limpar(linha['Empresa']),
                empresa_nome: limpar(linha['Empresa']),
                
                assistente: limpar(linha['Assistente']),
                nome_assistente: limpar(linha['Assistente']),
                
                auditora: limpar(linha['Auditora']),
                nome_auditora_raw: limpar(linha['Auditora']),
                
                doc_name: limpar(linha['doc_name']),
                status: limpar(linha['STATUS']), 
                
                obs: limpar(linha['Apontamentos/obs']),
                observacao: limpar(linha['Apontamentos/obs']),

                // --- NOVAS COLUNAS PARA ANÁLISE DETALHADA ---
                documento_categoria: limpar(linha['DOCUMENTO']), // Aqui está o 'DOC_NDF_'
                nome_documento: limpar(linha['DOCUMENTO']),      // Mantemos compatibilidade
                
                fila: limpar(linha['Fila']),                     // Gradual, Prioridade...
                revalidacao: limpar(linha['Revalidação']),       // Sim/Não
                
                id_ppc: limpar(linha['ID PPC']),                 // ID do processo
                nome_ppc: limpar(linha[' Nome da PPC']),         // Nome do processo (Atenção ao espaço no CSV)
                
                schema_id: limpar(linha['Schema_id']),

                // Métricas
                porcentagem: pct, // Salva como número para permitir ordenação
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
        
        if (listaParaSalvar.length > 0) {
            console.log(`📦 Preparando para enviar ${listaParaSalvar.length} registros...`);
            await this.enviarParaSupabase(listaParaSalvar);
        } else {
            alert("Nenhum dado válido encontrado no arquivo.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            const BATCH_SIZE = 1000; // Lote de segurança
            let totalInserido = 0;
            const total = dados.length;
            
            const statusDiv = document.getElementById('status-importacao'); // Se houver elemento de status na tela
            
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // Usamos UPSERT para atualizar se já existir, baseado nos conflitos
                // Nota: O ideal é ter um ID único. Sem ID único, usamos composição.
                // Se 'id_ppc' for único no CSV, seria a melhor chave de conflito.
                // Como fallback, mantemos a lógica anterior, mas sugerimos id_ppc se possível.
                
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        // Se 'id_ppc' for a chave primária lógica, use: onConflict: 'id_ppc'
                        // Se não, mantemos a compatibilidade anterior:
                        onConflict: 'assistente,data_referencia,doc_name,status',
                        ignoreDuplicates: false 
                    });

                if (error) {
                    console.error("Erro no lote:", error);
                    // Não para o loop, tenta o próximo lote, mas loga o erro
                } else {
                    totalInserido += lote.length;
                }
                
                // Feedback visual no console ou tela
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Importando: ${pct}% (${totalInserido}/${total})`);
                    if(statusDiv) statusDiv.innerText = `${pct}%`;
                }
            }

            alert(`Importação Concluída!\n${totalInserido} registros processados.`);
            
            // Recarrega a tela atual se possível
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            } else if (typeof MinhaArea !== 'undefined' && MinhaArea.carregar) {
                MinhaArea.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro Fatal: ${error.message}`);
        }
    }
};