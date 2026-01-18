window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 800, 
    CONCURRENCY: 1, 

    // Limpeza profunda sugerida pelo QA: Nulo é Nulo.
    limparProfundo: function(val, isNumeric = false) {
        if (val === undefined || val === null) return null;
        const str = String(val).trim().replace(/^\s+|\s+$/g, '');
        if (str === "" || str.toLowerCase() === "nan") return null;

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
            const idPpc = this.limparProfundo(linha['ID PPC']);
            const assistente = this.limparProfundo(linha['Assistente']);

            if (!idPpc || !assistente) continue;
            if (cacheIds.has(idPpc)) continue; // Evita erro 500 por duplicidade no mesmo lote
            cacheIds.add(idPpc);

            // Tratamento de Data (Garante que apareça no dashboard)
            let dataRef = null;
            if (linha['end_time']) {
                const d = new Date(linha['end_time']);
                if (!isNaN(d.getTime())) dataRef = d.toISOString().split('T')[0];
            }

            listaParaSalvar.push({
                id_ppc: idPpc,
                data_referencia: dataRef,
                end_time: linha['end_time'],
                assistente: assistente,
                nome_assistente: assistente,
                doc_name: this.limparProfundo(linha['doc_name']),
                status: this.limparProfundo(linha['STATUS']),
                // Campos que devem ser NULOS se vazios
                auditora: this.limparProfundo(linha['Auditora']),
                porcentagem: this.limparProfundo(linha['% Assert'], true),
                qtd_nok: this.limparProfundo(linha['Nok'], true),
                qtd_ok: this.limparProfundo(linha['Ok'], true),
                num_campos: this.limparProfundo(linha['nº Campos'], true),
                qtd_validados: this.limparProfundo(linha['Quantidade_documentos_validados'], true),
                empresa: this.limparProfundo(linha['Empresa'])
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

            if (error) console.error("❌ Falha crítica no lote:", error.message);
            else console.log(`✅ Lote ${i/this.BATCH_SIZE + 1} enviado.`);
        }
        alert("Importação Concluída. Média da Samaria agora deve bater!");
    }
};