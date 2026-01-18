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

            // Pequeno delay para a UI atualizar antes de travar processando
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
            console.log("📂 [Importacao] Iniciando leitura. Foco: end_time literal.");
            
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

        // Função auxiliar para tratar números: Se vazio ou inválido, retorna null (ou 0 se preferir, mas null respeita a regra "vazio é vazio")
        const tratarInt = (val) => {
            if (val === "" || val === null || val === undefined) return null;
            const parsed = parseInt(val);
            return isNaN(parsed) ? null : parsed;
        };

        const tratarString = (val) => {
             if (val === "" || val === null || val === undefined) return null;
             return val.trim();
        };

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Validação mínima: Se não tem ID PPC ou end_time, provavelmente é linha inválida
            if (!linha['ID PPC'] && !linha['end_time']) continue;

            // --- LÓGICA DA DATA LITERAL (REGRA DE OURO) ---
            // Formato esperado: "2025-12-01T19:14:42.016Z"
            const endTimeRaw = linha['end_time'];
            let dataLiteral = null;

            if (endTimeRaw && endTimeRaw.includes('T')) {
                // Pega tudo antes do T: "2025-12-01"
                dataLiteral = endTimeRaw.split('T')[0];
            } else if (endTimeRaw && endTimeRaw.length >= 10) {
                // Fallback caso não tenha T mas seja string longa
                dataLiteral = endTimeRaw.substring(0, 10);
            }

            // Montagem do Objeto (Espelho do Banco)
            const objeto = {
                // Chave Única
                id_ppc: tratarInt(linha['ID PPC']),

                // Datas
                data_referencia: dataLiteral,
                end_time_raw: tratarString(linha['end_time']),
                data_auditoria: tratarString(linha['Data da Auditoria ']), // Atenção ao espaço no CSV se houver

                // IDs
                usuario_id: tratarInt(linha['id_assistente']),
                company_id: tratarInt(linha['Company_id']),
                schema_id: tratarInt(linha['Schema_id']),

                // Textos
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
                
                // UPSERT baseado no id_ppc (definido no SQL como Unique Index)
                const { error } = await Sistema.supabase
                    .from('assertividade') 
                    .upsert(lote, { 
                        onConflict: 'id_ppc', // Se o ID PPC já existir, atualiza os dados
                        ignoreDuplicates: false 
                    });

                if (error) throw error;
                
                totalInserido += lote.length;
                
                // Feedback Visual
                if (totalInserido % 5000 === 0 || totalInserido === total) {
                    const pct = Math.round((totalInserido / total) * 100);
                    console.log(`🚀 Importando: ${pct}%`);
                    if(statusDiv) statusDiv.innerText = `${pct}%`;
                }
            }

            alert(`Sucesso! ${totalInserido} registros processados.`);
            
            // Recarrega Dashboard se estiver na tela
            if (window.Gestao && Gestao.Assertividade) {
                Gestao.Assertividade.carregar();
            }

        } catch (error) {
            console.error("Erro Supabase:", error);
            alert(`Erro na importação: ${error.message}`);
        }
    }
};