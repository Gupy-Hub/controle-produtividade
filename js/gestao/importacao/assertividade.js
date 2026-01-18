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
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo arquivo...';
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
            console.log("📂 [Importacao] Iniciando leitura estrita (Null é Null).");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "UTF-8", 
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas encontradas: ${results.data.length}`);
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

        // --- TRATAMENTO ESTRITO DE NULOS ---
        // Se estiver vazio, undefined ou for só espaço em branco -> Retorna NULL
        // Não converte para 0.
        
        const tratarInt = (val) => {
            if (val === "" || val === null || val === undefined || val.trim() === "") return null;
            const parsed = parseInt(val);
            return isNaN(parsed) ? null : parsed;
        };

        const tratarString = (val) => {
             if (val === "" || val === null || val === undefined || val.trim() === "") return null;
             return val.trim();
        };

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Validação mínima para ignorar linhas totalmente vazias
            if (!linha['ID PPC'] && !linha['end_time']) continue;

            // Extração de data
            const endTimeRaw = linha['end_time'];
            let dataLiteral = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                dataLiteral = endTimeRaw.split('T')[0];
            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                dataLiteral = endTimeRaw.substring(0, 10);
            }

            // Mapeamento mantendo a fidelidade aos vazios
            const objeto = {
                id_ppc: tratarInt(linha['ID PPC']),
                data_referencia: dataLiteral,
                end_time_raw: tratarString(linha['end_time']),
                data_auditoria: tratarString(linha['Data da Auditoria ']),
                usuario_id: tratarInt(linha['id_assistente']),
                company_id: tratarInt(linha['Company_id']),
                schema_id: tratarInt(linha['Schema_id']),
                empresa_nome: tratarString(linha['Empresa']),
                assistente_nome: tratarString(linha['Assistente']),
                auditora_nome: tratarString(linha['Auditora']),
                doc_name: tratarString(linha['doc_name']),
                status: tratarString(linha['STATUS']),
                nome_ppc: tratarString(linha['Nome da PPC']),
                observacao: tratarString(linha['Apontamentos/obs']),
                tipo_documento: tratarString(linha['DOCUMENTO']),
                fila: tratarString(linha['Fila']),
                revalidacao: tratarString(linha['Revalidação']),
                
                // Métricas: Se vier vazio no CSV, salva null no banco
                qtd_campos: tratarInt(linha['nº Campos']),
                qtd_ok: tratarInt(linha['Ok']),
                qtd_nok: tratarInt(linha['Nok']),
                qtd_docs_validados: tratarInt(linha['Quantidade_documentos_validados']),
                
                // Porcentagem: Texto exato (ex: "100,00%" ou null)
                porcentagem_assertividade: tratarString(linha['% Assert'])
            };

            listaParaSalvar.push(objeto);
        }

        console.timeEnd("TempoTratamento");
        
        if (listaParaSalvar.length > 0) {
            await this.enviarParaSupabase(listaParaSalvar);
        } else {
            alert("Nenhum dado válido encontrado para importação.");
        }
    },

    enviarParaSupabase: async function(dados) {
        try {
            const BATCH_SIZE = 1000; 
            let totalInserido = 0;
            const total = dados.length;
            const statusDiv = document.getElementById('status-importacao');
            
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const lote = dados.slice(i, i + BATCH_SIZE);
                
                // Usamos a chave composta criada anteriormente
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'id_ppc,end_time_raw,schema_id,doc_name',
                        ignoreDuplicates: false 
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Importando: ${pct}%`);
                    if(statusDiv) statusDiv.innerText = `${pct}%`;
                }
            }

            alert(`Sucesso! ${totalInserido} registros processados.`);
            
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro na importação: ${error.message}`);
        }
    }
};