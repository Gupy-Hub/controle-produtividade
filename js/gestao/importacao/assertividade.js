window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 500,
    CONCURRENCY: 1,

    // Limpeza profunda: transforma " ", "" ou "NaN" em NULL real para o banco
    limparDado: function(val, isNumeric = false) {
        if (val === undefined || val === null) return null;
        const str = String(val).trim();
        if (str === "" || str.toLowerCase() === "nan" || str.toLowerCase() === "undefined") return null;

        if (isNumeric) {
            const num = parseFloat(str.replace('%', '').replace(',', '.'));
            return isNaN(num) ? null : num;
        }
        return str;
    },

    processarArquivo: function(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const btn = input.closest('div').querySelector('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
            btn.disabled = true;

            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", 
                complete: async (results) => {
                    await this.tratarEEnviar(results.data);
                    input.value = ''; 
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        }
    },

    tratarEEnviar: async function(linhas) {
        const listaParaSalvar = [];
        const cacheIds = new Set();

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const idPpc = this.limparDado(linha['ID PPC']);
            if (!idPpc) continue;

            if (cacheIds.has(idPpc)) continue;
            cacheIds.add(idPpc);

            // Tratamento de Data via end_time (Obrigatório para o Dashboard)
            let dataRef = null;
            if (linha['end_time']) {
                const d = new Date(linha['end_time']);
                if (!isNaN(d.getTime())) dataRef = d.toISOString().split('T')[0];
            }

            listaParaSalvar.push({
                id_ppc: idPpc,
                data_referencia: dataRef,
                end_time: linha['end_time'],
                
                // MAPEAMENTO DAS COLUNAS SOLICITADAS
                empresa_id: this.limparDado(linha['Company_id']), // Id da empresa
                empresa: this.limparDado(linha['Empresa']),
                
                obs: this.limparDado(linha['Apontamentos/obs']), // Observação
                observacao: this.limparDado(linha['Apontamentos/obs']),
                
                num_campos: this.limparDado(linha['nº Campos'], true), // Campos
                campos: this.limparDado(linha['nº Campos'], true),
                
                qtd_ok: this.limparDado(linha['Ok'], true), // Ok
                ok: this.limparDado(linha['Ok'], true),
                
                qtd_nok: this.limparDado(linha['Nok'], true), // Nok
                nok: this.limparDado(linha['Nok'], true),

                // Outros campos
                assistente: this.limparDado(linha['Assistente']),
                nome_assistente: this.limparDado(linha['Assistente']),
                doc_name: this.limparDado(linha['doc_name']),
                status: this.limparDado(linha['STATUS']),
                
                // TRAVA CONTRA AUDITORA FANTASMA
                // Se no CSV estiver vazio ou apenas espaços, vira NULL
                auditora: this.limparDado(linha['Auditora']), 
                nome_auditora_raw: this.limparDado(linha['Auditora']),
                
                // Métrica de assertividade (NULL se não auditado)
                porcentagem: this.limparDado(linha['% Assert'], true),
                
                // Data da Auditoria (nome da coluna no CSV tem espaço no fim)
                data_auditoria: this.limparDado(linha['Data da Auditoria ']),
                
                qtd_validados: this.limparDado(linha['Quantidade_documentos_validados'], true)
            });
        }
        await this.enviarLotes(listaParaSalvar);
    },

    enviarLotes: async function(dados) {
        for (let i = 0; i < dados.length; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { onConflict: 'id_ppc' });

            if (error) console.error("❌ Erro no lote:", error.message);
        }
        alert("Importação Concluída! Verifique Samaria 01/12 (37 auditados).");
    }
};