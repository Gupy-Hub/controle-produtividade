window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    // Configurações
    BATCH_SIZE: 1000,
    CONCURRENCY: 5,

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
            }, 50);
        }
    },

    lerCSV: function(file) {
        return new Promise((resolve) => {
            console.time("TempoLeitura");
            console.log("📂 [Importacao] Iniciando leitura...");
            
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", 
                complete: async (results) => {
                    console.timeEnd("TempoLeitura");
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
        
        // --- FUNÇÕES AUXILIARES CORRIGIDAS ---
        
        const limpar = (val) => (val && val !== '') ? String(val).trim() : null;
        
        // CORREÇÃO CRÍTICA: Se for vazio, retorna null (não 0)
        const numeroOuNull = (val) => {
            if (val === null || val === undefined || String(val).trim() === '') return null;
            
            const strVal = String(val).replace('%', '').replace(',', '.');
            const parsed = parseFloat(strVal);
            
            return isNaN(parsed) ? null : parsed;
        };

        // Para contagens (Ok, Nok), mantemos 0 se vazio, pois não existe "null acertos"
        const numeroContagem = (val) => {
            if (!val) return 0;
            const strVal = String(val).replace(',', '.');
            return isNaN(parseFloat(strVal)) ? 0 : parseFloat(strVal);
        };

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            
            if (!linha['Assistente'] && !linha['doc_name']) continue;

            // Tratamento Data
            let dataLiteral = null;
            const dataAuditRaw = linha['Data da Auditoria ']; 
            if (dataAuditRaw) {
                const partes = dataAuditRaw.split('/');
                if (partes.length === 3) dataLiteral = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 
            if (!dataLiteral && linha['end_time']) {
                const endTimeRaw = linha['end_time'];
                dataLiteral = endTimeRaw.length >= 10 ? endTimeRaw.substring(0, 10) : null;
            }

            listaParaSalvar.push({
                // IDs
                usuario_id: parseInt(linha['id_assistente']) || null, 
                company_id: limpar(linha['Company_id']), 
                empresa_id: parseInt(linha['Company_id']) || null,
                
                // Datas
                data_auditoria: dataLiteral, 
                data_referencia: linha['end_time'] || new Date().toISOString(), 
                end_time: linha['end_time'] ? new Date(linha['end_time']) : null,
                created_at: new Date().toISOString(),

                // Textos
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

                // Metadados
                documento_categoria: limpar(linha['DOCUMENTO']),
                nome_documento: limpar(linha['DOCUMENTO']),      
                fila: limpar(linha['Fila']),
                revalidacao: limpar(linha['Revalidação']),
                id_ppc: limpar(linha['ID PPC']),
                nome_ppc: limpar(linha[' Nome da PPC']), 
                schema_id: limpar(linha['Schema_id']),

                // --- CORREÇÃO AQUI: MÉTRICAS ---
                qtd_validados: numeroContagem(linha['Quantidade_documentos_validados']),
                
                // Porcentagem agora pode ser NULL
                porcentagem: numeroOuNull(linha['% Assert']), 
                
                num_campos: numeroContagem(linha['nº Campos']),
                campos: numeroContagem(linha['nº Campos']),
                
                qtd_ok: numeroContagem(linha['Ok']),
                ok: numeroContagem(linha['Ok']),
                
                qtd_nok: numeroContagem(linha['Nok']),
                nok: numeroContagem(linha['Nok'])
            });
        }

        console.timeEnd("TempoTratamento");
        
        if (listaParaSalvar.length > 0) {
            console.log(`📦 Enviando ${listaParaSalvar.length} registros...`);
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
        const lotes = [];
        
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            lotes.push(dados.slice(i, i + this.BATCH_SIZE));
        }

        const processarLote = async (lote) => {
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { 
                    // Chave de conflito para atualizar dados existentes
                    onConflict: 'assistente,data_referencia,doc_name,status',
                    ignoreDuplicates: false 
                });

            if (error) {
                console.error("Erro no lote:", error.message);
                erros += lote.length;
            } else {
                processados += lote.length;
            }
            if (statusDiv) statusDiv.innerText = `${Math.round((processados / total) * 100)}%`;
        };

        for (let i = 0; i < lotes.length; i += this.CONCURRENCY) {
            const grupoAtual = lotes.slice(i, i + this.CONCURRENCY);
            await Promise.all(grupoAtual.map(lote => processarLote(lote)));
            console.log(`🚀 Progresso: ${processados}/${total}`);
        }

        let msg = `Importação Finalizada!\n\n✅ Salvos: ${processados}\n❌ Falhas: ${erros}`;
        if(erros > 0) msg += "\n(Verifique o console)";
        alert(msg);
        
        if (typeof MinhaArea !== 'undefined' && MinhaArea.carregar) MinhaArea.carregar();
        else if (window.Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
    }
};