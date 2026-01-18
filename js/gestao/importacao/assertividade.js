window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 1000,
    CONCURRENCY: 1, // Envio sequencial para evitar travamento de conexão

    limparValor: function(val, isNumeric = false) {
        if (val === undefined || val === null) return null;
        const str = String(val).trim();
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
            
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
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
        const idsVistosNoLote = new Set(); // Para evitar o erro de "row a second time"

        console.log("⚙️ Processando datas e removendo duplicados...");

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const assistente = this.limparValor(linha['Assistente']);
            const idPpc = this.limparValor(linha['ID PPC']); // Usaremos como chave única
            
            if (!assistente || !idPpc) continue;

            // Evita processar o mesmo ID PPC duas vezes no mesmo lote (causa erro 500)
            if (idsVistosNoLote.has(idPpc)) continue;
            idsVistosNoLote.add(idPpc);

            // --- TRATAMENTO DE DATA (end_time para data_referencia) ---
            let dataReferencia = null;
            const rawEndTime = linha['end_time'];
            if (rawEndTime) {
                try {
                    const dateObj = new Date(rawEndTime);
                    if (!isNaN(dateObj.getTime())) {
                        // Força formato YYYY-MM-DD para o filtro funcionar
                        dataReferencia = dateObj.toISOString().split('T')[0];
                    }
                } catch (e) { console.error("Data inválida:", rawEndTime); }
            }

            listaParaSalvar.push({
                id_ppc: idPpc,
                usuario_id: parseInt(linha['id_assistente']) || null,
                data_referencia: dataReferencia,
                end_time: rawEndTime,
                empresa: this.limparValor(linha['Empresa']),
                assistente: assistente,
                nome_assistente: assistente,
                doc_name: this.limparValor(linha['doc_name']),
                status: this.limparValor(linha['STATUS']),
                auditora: this.limparValor(linha['Auditora']),
                porcentagem: this.limparValor(linha['% Assert'], true),
                qtd_nok: this.limparValor(linha['Nok'], true),
                qtd_ok: this.limparValor(linha['Ok'], true),
                num_campos: this.limparValor(linha['nº Campos'], true),
                qtd_validados: this.limparValor(linha['Quantidade_documentos_validados'], true),
                obs: this.limparValor(linha['Apontamentos/obs']),
                documento_categoria: this.limparValor(linha['DOCUMENTO']),
                nome_documento: this.limparValor(linha['DOCUMENTO']),
                revalidacao: this.limparValor(linha['Revalidação'])
            });
        }

        await this.enviarLotes(listaParaSalvar);
    },

    enviarLotes: async function(dados) {
        const total = dados.length;
        console.log(`📦 Enviando ${total} registros sem duplicados...`);

        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { onConflict: 'id_ppc' }); // AGORA USAMOS ID_PPC QUE É INFALÍVEL

            if (error) {
                console.error("❌ Erro grave no lote:", error.message);
            } else {
                console.log(`✅ Progresso: ${Math.min(i + this.BATCH_SIZE, total)} / ${total}`);
            }
        }
        alert("Importação Finalizada! Datas e Auditoras corrigidas.");
    }
};