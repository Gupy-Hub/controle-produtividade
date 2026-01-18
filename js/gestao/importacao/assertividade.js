window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    // Configurações de Performance
    BATCH_SIZE: 1000,      // Tamanho do lote (registros por envio)
    CONCURRENCY: 5,        // Quantos lotes enviar ao mesmo tempo (Paralelismo)

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

            // Timeout para garantir que a UI atualize antes de travar o processamento
            setTimeout(() => {
                this.lerCSV(file).finally(() => {
                    input.value = ''; 
                    if (btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        btn.classList.remove('cursor-not-allowed', 'opacity-75');
                    }
                });
            }, 50);
        }
    },

    lerCSV: function(file) {
        return new Promise((resolve) => {
            console.time("TempoLeitura");
            console.log("📂 [Importacao] Iniciando leitura rápida...");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", // Mantendo padrão Excel Brasil
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
                    console.log(`📊 Linhas lidas: ${results.data.length}`);
                    
                    // Validação rápida se tem dados
                    if(results.data.length === 0) {
                        alert("Arquivo vazio.");
                        resolve();
                        return;
                    }

                    await this.tratarEEnviar(results.data);
                    resolve();
                },
                error: (error) => {
                    console.error("Erro CSV:", error);
                    alert("Erro ao ler o arquivo CSV.");
                    resolve();
                }
            });
        });
    },

    tratarEEnviar: async function(linhas) {
        console.time("TempoTratamento");
        const listaParaSalvar = [];
        
        // Funções auxiliares otimizadas (fora do loop)
        const limpar = (val) => (val && val !== '') ? String(val).trim() : null;
        const numero = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            // Otimização: replace simples
            const v = val.replace('%', '').replace(',', '.');
            return v ? parseFloat(v) : 0;
        };

        // Loop principal de transformação
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            // Validação mínima
            if (!linha['Assistente'] && !linha['doc_name']) continue;

            // Tratamento de Data Otimizado
            let dataLiteral = null;
            const dataAuditRaw = linha['Data da Auditoria ']; // Com espaço
            
            if (dataAuditRaw) {
                // Formato esperado: DD/MM/AAAA
                const partes = dataAuditRaw.split('/');
                if (partes.length === 3) {
                    dataLiteral = `${partes[2]}-${partes[1]}-${partes[0]}`;
                }
            } 
            
            if (!dataLiteral) {
                const endTimeRaw = linha['end_time'];
                if (endTimeRaw) {
                    dataLiteral = endTimeRaw.length >= 10 ? endTimeRaw.substring(0, 10) : null;
                }
            }

            // Montagem do Objeto (Mapeamento Completo)
            listaParaSalvar.push({
                // Chaves
                usuario_id: parseInt(linha['id_assistente']) || null, 
                company_id: limpar(linha['Company_id']), 
                empresa_id: parseInt(linha['Company_id']) || null,
                
                // Datas
                data_auditoria: dataLiteral, 
                data_referencia: linha['end_time'] || new Date().toISOString(), 
                end_time: linha['end_time'] ? new Date(linha['end_time']) : null,
                created_at: new Date().toISOString(),

                // Descritivos
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

                // Novas Colunas (NDF e Análises)
                documento_categoria: limpar(linha['DOCUMENTO']), // *** NDF ***
                nome_documento: limpar(linha['DOCUMENTO']),      
                fila: limpar(linha['Fila']),
                revalidacao: limpar(linha['Revalidação']),
                id_ppc: limpar(linha['ID PPC']),
                nome_ppc: limpar(linha[' Nome da PPC']), 
                schema_id: limpar(linha['Schema_id']),

                // Métricas
                porcentagem: numero(linha['% Assert']),
                num_campos: numero(linha['nº Campos']),
                campos: numero(linha['nº Campos']),
                qtd_ok: numero(linha['Ok']),
                ok: numero(linha['Ok']),
                qtd_nok: numero(linha['Nok']),
                nok: numero(linha['Nok'])
            });
        }

        console.timeEnd("TempoTratamento");
        
        if (listaParaSalvar.length > 0) {
            console.log(`📦 Enviando ${listaParaSalvar.length} registros com concorrência de ${this.CONCURRENCY}...`);
            await this.enviarLotesConcorrentes(listaParaSalvar);
        } else {
            alert("Nenhum dado válido processado.");
        }
    },

    enviarLotesConcorrentes: async function(dados) {
        const total = dados.length;
        let processados = 0;
        let erros = 0;
        
        const statusDiv = document.getElementById('status-importacao');
        
        // Dividir em lotes
        const lotes = [];
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            lotes.push(dados.slice(i, i + this.BATCH_SIZE));
        }

        console.time("TempoEnvioTotal");

        // Função para processar um lote único
        const processarLote = async (lote) => {
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { 
                    onConflict: 'assistente,data_referencia,doc_name,status', // Ajuste se tiver chave única melhor (ex: id_ppc)
                    ignoreDuplicates: false 
                });

            if (error) {
                console.error("Erro no lote:", error.message);
                erros += lote.length;
            } else {
                processados += lote.length;
            }

            // Atualiza UI
            if (statusDiv) {
                const pct = Math.round((processados / total) * 100);
                statusDiv.innerText = `${pct}%`;
            }
        };

        // Gerenciador de Concorrência (Promise Pool simples)
        for (let i = 0; i < lotes.length; i += this.CONCURRENCY) {
            // Pega um grupo de lotes (ex: 5 lotes)
            const grupoAtual = lotes.slice(i, i + this.CONCURRENCY);
            
            // Dispara todos ao mesmo tempo e espera todos terminarem
            await Promise.all(grupoAtual.map(lote => processarLote(lote)));
            
            console.log(`🚀 Progresso: ${processados}/${total}`);
        }

        console.timeEnd("TempoEnvioTotal");

        let msg = `Importação Finalizada!\n\n✅ Salvos: ${processados}\n❌ Falhas: ${erros}`;
        if(erros > 0) msg += "\n(Verifique o console para erros)";
        
        alert(msg);
        
        // Recarrega a tela ativa
        if (typeof MinhaArea !== 'undefined' && MinhaArea.carregar) {
            MinhaArea.carregar();
        } else if (window.Gestao && Gestao.Assertividade) {
            Gestao.Assertividade.carregar();
        }
    }
};