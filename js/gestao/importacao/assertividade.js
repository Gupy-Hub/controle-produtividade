window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 1000,
    CONCURRENCY: 5,

    // Limpeza rigorosa: se for só espaço ou vazio, vira NULL literal
    limparRigoroso: function(val) {
        if (val === undefined || val === null) return null;
        const str = String(val).trim().replace(/^\s+|\s+$/g, '');
        return str === "" ? null : str;
    },

    // Tratamento de números: vazio vira NULL (evita o erro do 0%)
    numeroOuNull: function(val) {
        const str = this.limparRigoroso(val);
        if (str === null) return null;
        const num = parseFloat(str.replace('%', '').replace(',', '.'));
        return isNaN(num) ? null : num;
    },

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = btn ? btn.innerHTML : '';
            
            if (btn) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
                btn.disabled = true;
            }

            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", 
                complete: async (results) => {
                    await this.tratarEEnviar(results.data);
                    input.value = ''; 
                    if (btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                }
            });
        }
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const assistente = this.limparRigoroso(linha['Assistente']);
            const doc = this.limparRigoroso(linha['doc_name']);
            
            if (!assistente && !doc) continue;

            // --- TRATAMENTO DA DATA (end_time) ---
            const rawEndTime = this.limparRigoroso(linha['end_time']);
            let dataReferencia = null;
            let timestampISO = null;

            if (rawEndTime) {
                // Criamos um objeto Date real para garantir o formato ISO no banco
                const dateObj = new Date(rawEndTime);
                if (!isNaN(dateObj.getTime())) {
                    timestampISO = dateObj.toISOString();
                    dataReferencia = timestampISO.split('T')[0]; // YYYY-MM-DD
                }
            }

            // Tratamento da Data da Auditoria (se existir)
            let dataAuditoria = null;
            const rawAuditDate = this.limparRigoroso(linha['Data da Auditoria ']);
            if (rawAuditDate && rawAuditDate.includes('/')) {
                const p = rawAuditDate.split('/');
                if (p.length === 3) dataAuditoria = `${p[2]}-${p[1]}-${p[0]}`;
            }

            listaParaSalvar.push({
                usuario_id: parseInt(linha['id_assistente']) || null,
                
                // Datas vindas do end_time
                data_referencia: dataReferencia, // Coluna usada nos filtros (YYYY-MM-DD)
                end_time: timestampISO,          // Timestamp completo
                data_auditoria: dataAuditoria,

                // Texto com limpeza (Se estiver vazio no CSV, salva NULL no banco)
                empresa: this.limparRigoroso(linha['Empresa']),
                assistente: assistente,
                nome_assistente: assistente,
                doc_name: doc,
                status: this.limparRigoroso(linha['STATUS']),
                auditora: this.limparRigoroso(linha['Auditora']), // Se vazio, fica NULL
                nome_auditora_raw: this.limparRigoroso(linha['Auditora']),
                obs: this.limparRigoroso(linha['Apontamentos/obs']),
                fila: this.limparRigoroso(linha['Fila']),
                revalidacao: this.limparRigoroso(linha['Revalidação']),
                documento_categoria: this.limparRigoroso(linha['DOCUMENTO']),
                nome_documento: this.limparRigoroso(linha['DOCUMENTO']),
                id_ppc: this.limparRigoroso(linha['ID PPC']),
                nome_ppc: this.limparRigoroso(linha[' Nome da PPC']),

                // Números com limpeza (Se vazio no CSV, salva NULL no banco)
                qtd_validados: this.numeroOuNull(linha['Quantidade_documentos_validados']),
                porcentagem: this.numeroOuNull(linha['% Assert']),
                num_campos: this.numeroOuNull(linha['nº Campos']),
                qtd_ok: this.numeroOuNull(linha['Ok']),
                qtd_nok: this.numeroOuNull(linha['Nok'])
            });
        }

        if (listaParaSalvar.length > 0) {
            await this.enviarLotes(listaParaSalvar);
        }
    },

    enviarLotes: async function(dados) {
        const total = dados.length;
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { onConflict: 'assistente,data_referencia,doc_name,status' });

            if (error) console.error("Erro no lote:", error.message);
        }
        alert("Importação Concluída! Datas processadas via end_time e vazios preservados como NULOS.");
    }
};