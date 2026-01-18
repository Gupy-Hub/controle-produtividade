// Garante que o namespace existe
window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 1000,
    CONCURRENCY: 5,

    // Helper rigoroso para Texto (Auditora, Status, etc)
    limparTextoRigoroso: function(val) {
        if (val === undefined || val === null) return null;
        const str = String(val).trim().replace(/^\s+|\s+$/g, '');
        return str === "" ? null : str;
    },

    // Helper rigoroso para Números (Vazio vira NULL)
    limparNumeroRigoroso: function(val) {
        const str = this.limparTextoRigoroso(val);
        if (str === null) return null;
        const num = parseFloat(str.replace('%', '').replace(',', '.'));
        return isNaN(num) ? null : num;
    },

    // ESTA É A FUNÇÃO QUE O HTML CHAMA
    processarArquivo: function(input) {
        console.log("🚀 Importação iniciada...");
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = '';
            
            if (btn) {
                originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo CSV...';
                btn.disabled = true;
            }

            // PapaParse para ler o arquivo
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                encoding: "ISO-8859-1", 
                complete: async (results) => {
                    console.log(`📂 CSV Lido: ${results.data.length} linhas.`);
                    await this.tratarEEnviar(results.data);
                    input.value = ''; // Limpa o input
                    if (btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                },
                error: (error) => {
                    console.error("Erro PapaParse:", error);
                    alert("Erro ao ler o arquivo CSV.");
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
        console.log("⚙️ Tratando dados e removendo vazios...");

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            if (!this.limparTextoRigoroso(linha['Assistente']) && !this.limparTextoRigoroso(linha['doc_name'])) continue;

            let dataLiteral = null;
            const dataAuditRaw = this.limparTextoRigoroso(linha['Data da Auditoria ']); 
            if (dataAuditRaw) {
                const partes = dataAuditRaw.split('/');
                if (partes.length === 3) dataLiteral = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 

            listaParaSalvar.push({
                usuario_id: parseInt(linha['id_assistente']) || null,
                data_referencia: this.limparTextoRigoroso(linha['end_time']), 
                end_time: linha['end_time'] ? new Date(linha['end_time']) : null,
                empresa: this.limparTextoRigoroso(linha['Empresa']),
                assistente: this.limparTextoRigoroso(linha['Assistente']),
                nome_assistente: this.limparTextoRigoroso(linha['Assistente']),
                
                // --- PROTEÇÃO RIGOROSA CONTRA VAZIOS ---
                auditora: this.limparTextoRigoroso(linha['Auditora']),
                nome_auditora_raw: this.limparTextoRigoroso(linha['Auditora']),
                
                doc_name: this.limparTextoRigoroso(linha['doc_name']),
                status: this.limparTextoRigoroso(linha['STATUS']), 
                obs: this.limparTextoRigoroso(linha['Apontamentos/obs']),
                documento_categoria: this.limparTextoRigoroso(linha['DOCUMENTO']),
                fila: this.limparTextoRigoroso(linha['Fila']),
                revalidacao: this.limparTextoRigoroso(linha['Revalidação']),
                id_ppc: this.limparTextoRigoroso(linha['ID PPC']),
                nome_ppc: this.limparTextoRigoroso(linha[' Nome da PPC']), 

                qtd_validados: this.limparNumeroRigoroso(linha['Quantidade_documentos_validados']),
                porcentagem: this.limparNumeroRigoroso(linha['% Assert']),
                num_campos: this.limparNumeroRigoroso(linha['nº Campos']),
                qtd_ok: this.limparNumeroRigoroso(linha['Ok']),
                qtd_nok: this.limparNumeroRigoroso(linha['Nok']),
                data_auditoria: dataLiteral
            });
        }

        if (listaParaSalvar.length > 0) {
            console.log(`📦 Enviando ${listaParaSalvar.length} registros para o Supabase...`);
            await this.enviarLotesConcorrentes(listaParaSalvar);
        }
    },

    enviarLotesConcorrentes: async function(dados) {
        const total = dados.length;
        let processados = 0;
        const lotes = [];
        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            lotes.push(dados.slice(i, i + this.BATCH_SIZE));
        }

        const processarLote = async (lote) => {
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { onConflict: 'assistente,data_referencia,doc_name,status' });

            if (error) console.error("Erro no lote:", error.message);
            else processados += lote.length;
        };

        for (let i = 0; i < lotes.length; i += this.CONCURRENCY) {
            const grupoAtual = lotes.slice(i, i + this.CONCURRENCY);
            await Promise.all(grupoAtual.map(lote => processarLote(lote)));
        }
        alert("Importação Concluída! Vazios foram salvos como NULOS.");
    }
};