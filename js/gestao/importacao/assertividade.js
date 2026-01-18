window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    BATCH_SIZE: 500, // Reduzi um pouco para garantir estabilidade no envio paralelo
    CONCURRENCY: 3,

    // Limpeza profunda: Remove espaços e garante NULL se estiver vazio
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
            const parentDiv = input.closest('div');
            const btn = parentDiv ? parentDiv.querySelector('button') : null;
            let originalText = btn ? btn.innerHTML : 'Importar';
            
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
        console.log("⚙️ Iniciando tratamento rigoroso de NULOS...");

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const assistente = this.limparValor(linha['Assistente']);
            if (!assistente) continue;

            // Tratamento de Datas
            let dataReferencia = null;
            if (linha['end_time']) {
                const dateObj = new Date(linha['end_time']);
                if (!isNaN(dateObj.getTime())) {
                    dataReferencia = dateObj.toISOString().split('T')[0];
                }
            }

            let dataAuditoria = null;
            const rawAudit = this.limparValor(linha['Data da Auditoria ']);
            if (rawAudit && rawAudit.includes('/')) {
                const p = rawAudit.split('/');
                if (p.length === 3) dataAuditoria = `${p[2]}-${p[1]}-${p[0]}`;
            }

            // Montagem do Objeto (Somente o que for estritamente necessário)
            const registro = {
                usuario_id: parseInt(linha['id_assistente']) || null,
                data_referencia: dataReferencia,
                end_time: this.limparValor(linha['end_time']),
                data_auditoria: dataAuditoria,
                empresa: this.limparValor(linha['Empresa']),
                assistente: assistente,
                nome_assistente: assistente,
                doc_name: this.limparValor(linha['doc_name']),
                status: this.limparValor(linha['STATUS']),
                
                // --- CAMPOS CRÍTICOS (NULO É NULO) ---
                auditora: this.limparValor(linha['Auditora']),
                nome_auditora_raw: this.limparValor(linha['Auditora']),
                porcentagem: this.limparValor(linha['% Assert'], true),
                qtd_nok: this.limparValor(linha['Nok'], true),
                qtd_ok: this.limparValor(linha['Ok'], true),
                num_campos: this.limparValor(linha['nº Campos'], true),
                qtd_validados: this.limparValor(linha['Quantidade_documentos_validados'], true),
                
                obs: this.limparValor(linha['Apontamentos/obs']),
                fila: this.limparValor(linha['Fila']),
                revalidacao: this.limparValor(linha['Revalidação']),
                documento_categoria: this.limparValor(linha['DOCUMENTO']),
                nome_documento: this.limparValor(linha['DOCUMENTO']),
                id_ppc: this.limparValor(linha['ID PPC']),
                nome_ppc: this.limparValor(linha[' Nome da PPC'])
            };

            listaParaSalvar.push(registro);
        }

        if (listaParaSalvar.length > 0) {
            await this.enviarLotes(listaParaSalvar);
        }
    },

    enviarLotes: async function(dados) {
        const total = dados.length;
        console.log(`📦 Enviando ${total} registros em lotes...`);

        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const lote = dados.slice(i, i + this.BATCH_SIZE);
            
            // Upsert para evitar duplicidade baseado na chave de conflito
            const { error } = await Sistema.supabase
                .from('assertividade') 
                .upsert(lote, { 
                    onConflict: 'assistente,data_referencia,doc_name,status',
                    ignoreDuplicates: false 
                });

            if (error) {
                console.error("❌ Erro no lote:", error.message);
                // Se der erro 500, mostramos o primeiro objeto do lote para debugar
                console.log("Amostra do registro com erro:", lote[0]);
            } else {
                console.log(`✅ Progresso: ${Math.min(i + this.BATCH_SIZE, total)} / ${total}`);
            }
        }
        alert("Importação Concluída!");
    }
};